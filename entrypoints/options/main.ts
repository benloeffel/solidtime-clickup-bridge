import { browser } from "wxt/browser";
import type { Membership, Project } from "../../src/core/solidtime";
import type { ProjectMapping } from "../../src/core/projectResolver";
import { InstanceUrlError, MAX_NAME_LENGTH, parseInstanceUrl } from "../../src/core/validate";
import {
  createClient,
  DEFAULT_SETTINGS,
  hasValidInstanceUrl,
  loadSettings,
  originPattern,
  saveSettings,
  type Settings,
} from "../../src/settings";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const baseUrlInput = byId<HTMLInputElement>("baseUrl");
const tokenInput = byId<HTMLInputElement>("token");
const connectStatus = byId<HTMLParagraphElement>("connectStatus");
const trackingSection = byId<HTMLElement>("trackingSection");
const organizationSelect = byId<HTMLSelectElement>("organization");
const defaultProjectSelect = byId<HTMLSelectElement>("defaultProject");
const billableInput = byId<HTMLInputElement>("billable");
const autoMatchInput = byId<HTMLInputElement>("autoMatch");
const mappingRows = byId<HTMLTableSectionElement>("mappingRows");
const rowTemplate = byId<HTMLTemplateElement>("mappingRowTemplate");
const saveStatus = byId<HTMLParagraphElement>("saveStatus");
const MISSING_PROJECT_LABEL = "⚠ Project no longer exists";

let settings: Settings;
let memberships: Membership[] = [];
let projects: Project[] = [];

function setStatus(el: HTMLElement, message: string, kind: "ok" | "err" | "" = "") {
  el.textContent = message;
  el.className = `status ${kind}`;
}

const projectExists = (id: string | null) => !!id && projects.some((p) => p.id === id);

/** A saved project that was deleted in Solidtime stays visible (flagged) instead of silently vanishing. */
function fillProjectSelect(select: HTMLSelectElement, selected: string | null, emptyLabel: string) {
  select.replaceChildren(new Option(emptyLabel, ""));
  for (const project of projects) select.add(new Option(project.name, project.id));
  if (selected && !projectExists(selected)) select.add(new Option(MISSING_PROJECT_LABEL, selected));
  select.value = selected ?? "";
}

function countMissingProjects(): number {
  const selects = [defaultProjectSelect, ...mappingRows.querySelectorAll<HTMLSelectElement>('[data-field="project"]')];
  return selects.filter((select) => select.value && !projectExists(select.value)).length;
}

function warnAboutMissingProjects() {
  const missing = countMissingProjects();
  if (missing > 0) {
    setStatus(
      saveStatus,
      `${missing} setting(s) point to a Solidtime project that no longer exists. Pick another project, or they will be cleared when you save.`,
      "err",
    );
  }
}

function addMappingRow(kind: keyof Omit<ProjectMapping, "defaultProjectId">, name: string, projectId: string) {
  const row = rowTemplate.content.firstElementChild!.cloneNode(true) as HTMLTableRowElement;
  row.querySelector<HTMLSelectElement>('[data-field="kind"]')!.value = kind;
  row.querySelector<HTMLInputElement>('[data-field="name"]')!.value = name;
  fillProjectSelect(row.querySelector<HTMLSelectElement>('[data-field="project"]')!, projectId, "Choose a project…");
  row.querySelector("button.remove")!.addEventListener("click", () => row.remove());
  mappingRows.appendChild(row);
}

function renderMappings() {
  mappingRows.replaceChildren();
  for (const [name, projectId] of Object.entries(settings.mapping.lists)) addMappingRow("lists", name, projectId);
  for (const [name, projectId] of Object.entries(settings.mapping.spaces)) addMappingRow("spaces", name, projectId);
}

function readForm(): Settings {
  const mapping: ProjectMapping = {
    lists: {},
    spaces: {},
    defaultProjectId: projectExists(defaultProjectSelect.value) ? defaultProjectSelect.value : null,
  };
  for (const row of Array.from(mappingRows.rows)) {
    const kind = row.querySelector<HTMLSelectElement>('[data-field="kind"]')!.value as "lists" | "spaces";
    const name = row.querySelector<HTMLInputElement>('[data-field="name"]')!.value.trim().slice(0, MAX_NAME_LENGTH);
    const projectId = row.querySelector<HTMLSelectElement>('[data-field="project"]')!.value;
    // Only ids that exist in the organization; Object.hasOwn guards against "__proto__"-style names.
    if (name && projectExists(projectId) && !Object.hasOwn(mapping[kind], name)) {
      Object.defineProperty(mapping[kind], name, {
        value: projectId,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  const membership = memberships.find((m) => m.organization.id === organizationSelect.value);
  return {
    ...settings,
    organizationId: membership?.organization.id ?? settings.organizationId,
    memberId: membership?.id ?? settings.memberId,
    billable: billableInput.checked,
    autoMatch: autoMatchInput.checked,
    mapping,
  };
}

async function loadProjects() {
  projects = settings.organizationId ? await createClient(settings).getProjects(settings.organizationId) : [];
  fillProjectSelect(defaultProjectSelect, settings.mapping.defaultProjectId, "No project");
  renderMappings();
  warnAboutMissingProjects();
}

async function loadRemote() {
  memberships = await createClient(settings).getMemberships();
  if (memberships.length === 0) throw new Error("This account is not a member of any organization.");

  const current = memberships.find((m) => m.organization.id === settings.organizationId) ?? memberships[0]!;
  settings = { ...settings, organizationId: current.organization.id, memberId: current.id };

  organizationSelect.replaceChildren(...memberships.map((m) => new Option(m.organization.name, m.organization.id)));
  organizationSelect.value = current.organization.id;
  billableInput.checked = settings.billable;
  autoMatchInput.checked = settings.autoMatch;
  await loadProjects();
  trackingSection.hidden = false;
}

byId("connect").addEventListener("click", async () => {
  let baseUrl: string;
  try {
    baseUrl = parseInstanceUrl(baseUrlInput.value);
  } catch (error) {
    if (!(error instanceof InstanceUrlError)) throw error;
    return setStatus(connectStatus, error.message, "err");
  }
  const token = tokenInput.value.trim();
  if (!token) return setStatus(connectStatus, "Paste an API token.", "err");

  // Must run directly in the click handler: browsers only show the prompt for user gestures.
  const granted = await browser.permissions.request({ origins: [originPattern(baseUrl)] });
  if (!granted) return setStatus(connectStatus, "Access to your Solidtime instance is required.", "err");

  setStatus(connectStatus, "Connecting…");
  settings = { ...settings, baseUrl, token };
  try {
    await loadRemote();
    settings = readForm();
    await saveSettings(settings);
    setStatus(connectStatus, "Connected. Open a ClickUp task to start tracking.", "ok");
  } catch (error) {
    trackingSection.hidden = true;
    setStatus(connectStatus, (error as Error).message, "err");
  }
});

organizationSelect.addEventListener("change", async () => {
  // Projects belong to one organization, so mappings can't carry over.
  const hasMappings = mappingRows.rows.length > 0 || defaultProjectSelect.value !== "";
  if (
    hasMappings &&
    !confirm("Switching the organization clears your default project and manual mappings. Continue?")
  ) {
    organizationSelect.value = settings.organizationId;
    return;
  }
  settings = { ...readForm(), mapping: { lists: {}, spaces: {}, defaultProjectId: null } };
  try {
    await loadProjects();
  } catch (error) {
    setStatus(saveStatus, (error as Error).message, "err");
  }
});

byId("addMapping").addEventListener("click", () => addMappingRow("lists", "", ""));

byId("save").addEventListener("click", async () => {
  const cleared = countMissingProjects();
  settings = readForm();
  await saveSettings(settings);
  renderMappings();
  fillProjectSelect(defaultProjectSelect, settings.mapping.defaultProjectId, "No project");
  setStatus(
    saveStatus,
    cleared ? `Saved. Cleared ${cleared} setting(s) that pointed to deleted projects.` : "Saved.",
    "ok",
  );
  setTimeout(() => setStatus(saveStatus, ""), 2500);
});

byId("disconnect").addEventListener("click", async () => {
  const origin = settings.baseUrl ? originPattern(settings.baseUrl) : null;
  settings = { ...DEFAULT_SETTINGS };
  await saveSettings(settings);
  if (origin) await browser.permissions.remove({ origins: [origin] }).catch(() => false);
  baseUrlInput.value = "";
  tokenInput.value = "";
  trackingSection.hidden = true;
  setStatus(connectStatus, "Disconnected. The token was removed from this browser; revoke it in Solidtime too.", "ok");
});

async function init() {
  settings = await loadSettings();
  baseUrlInput.value = settings.baseUrl;
  tokenInput.value = settings.token;
  if (!settings.baseUrl || !settings.token) return;
  // Never send the stored token to a URL that fails today's rules (same check as the background).
  if (!hasValidInstanceUrl(settings)) {
    return setStatus(
      connectStatus,
      "The saved URL is not allowed any more (https is required). Enter it again and click Connect.",
      "err",
    );
  }
  try {
    await loadRemote();
    setStatus(connectStatus, "Connected.", "ok");
  } catch (error) {
    setStatus(connectStatus, (error as Error).message, "err");
  }
}

void init();
