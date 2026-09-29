import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { createProjectCache } from "../src/background/projectCache";
import { createSerialQueue } from "../src/background/serialQueue";
import { refreshSolidtimeTabs } from "../src/background/solidtimeTabs";
import { createStateHub } from "../src/background/stateHub";
import { trackedTask } from "../src/background/trackedTask";
import type { ProjectResolution } from "../src/core/projectResolver";
import type { SolidtimeClient } from "../src/core/solidtime";
import { entryTaskIds, taskIds, toggleTask, type ClickUpTask } from "../src/core/timerToggle";
import { sanitizeTask } from "../src/core/validate";
import type { State, ToggleResponse } from "../src/messages";
import { createClient, isConfigured, loadSettings, originPattern, type Settings } from "../src/settings";

const DEFAULT_MAX_AGE_MS = 15_000;
const MIN_MAX_AGE_MS = 1_000;
const CLICKUP_ORIGIN = "https://app.clickup.com";

export default defineBackground(() => {
  // Keep the API token out of reach of content scripts (Chromium; Firefox has no equivalent).
  void browser.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});

  const hub = createStateHub();
  const projectCache = createProjectCache();
  // Toggles run one at a time, so two tabs clicking at once can't create two running entries.
  const serialized = createSerialQueue();
  let lastFetch = 0;

  async function clientFor(settings: Settings): Promise<SolidtimeClient> {
    const granted = await browser.permissions.contains({ origins: [originPattern(settings.baseUrl)] });
    if (!granted)
      throw new Error("The extension has no access to your Solidtime instance. Open the options and click Connect.");
    return createClient(settings);
  }

  async function refresh(maxAgeMs: number): Promise<State> {
    const settings = await loadSettings();
    if (!isConfigured(settings)) return hub.publish({ configured: false, activeTaskIds: [] });
    const current = hub.current();
    if (current.configured && Date.now() - lastFetch < maxAgeMs) return current;

    try {
      const active = await (await clientFor(settings)).getActiveTimeEntry();
      lastFetch = Date.now();
      const activeTaskIds = active ? entryTaskIds(active, await trackedTask.lookup()) : [];
      return hub.publish({ configured: true, activeTaskIds });
    } catch {
      // Keep showing the last known state; the next refresh or click will retry.
      return current;
    }
  }

  async function toggle(rawTask: unknown): Promise<ToggleResponse> {
    const task = sanitizeTask(rawTask);
    if (!task) return { ok: false, error: "Could not read this ClickUp task." };

    const settings = await loadSettings();
    if (!isConfigured(settings)) {
      await browser.runtime.openOptionsPage();
      return { ok: false, error: "Set up Solidtime in the extension options first." };
    }
    try {
      const client = await clientFor(settings);
      const { projects, loaded } = settings.autoMatch
        ? await projectCache.forMatching(client, settings.organizationId, task.location ?? {})
        : { projects: [], loaded: true };
      const result = await toggleTask(
        client,
        task,
        { ...settings, autoMatchProjects: projects },
        await trackedTask.lookup(),
      );

      lastFetch = Date.now();
      if (result.active) await trackedTask.remember(result.active, taskIds(task));
      await hub.publish({ configured: true, activeTaskIds: result.active ? taskIds(task) : [] });
      void refreshSolidtimeTabs(settings.baseUrl);

      const warning = result.active ? noProjectWarning(result.project, task, settings, loaded) : undefined;
      return warning ? { ok: true, warning } : { ok: true };
    } catch (error) {
      await refresh(0);
      return { ok: false, error: (error as Error).message };
    }
  }

  /** Auto-match is on but nothing (not even a default) applied: say why instead of failing silently. */
  function noProjectWarning(
    project: ProjectResolution,
    task: ClickUpTask,
    settings: Settings,
    projectsLoaded: boolean,
  ) {
    if (project.source !== "none" || !settings.autoMatch) return undefined;
    if (!projectsLoaded) return "Timer started without a project: the Solidtime project list could not be loaded.";
    const list = task.location?.list;
    return list
      ? `Timer started without a project: no Solidtime project name appears in the List "${list}".`
      : "Timer started without a project: the ClickUp List name could not be read on this page.";
  }

  /** Only our own content scripts on ClickUp and our own extension pages may talk to us. */
  function isTrustedSender(sender: Browser.runtime.MessageSender): boolean {
    if (sender.id !== browser.runtime.id || !sender.url) return false;
    const origin = new URL(sender.url).origin;
    return origin === CLICKUP_ORIGIN || origin === new URL(browser.runtime.getURL("/")).origin;
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isTrustedSender(sender) || typeof message !== "object" || message === null) return false;
    const { type, task, maxAgeMs } = message as Record<string, unknown>;

    let work: Promise<unknown>;
    if (type === "getState") {
      const age =
        typeof maxAgeMs === "number" && maxAgeMs >= MIN_MAX_AGE_MS
          ? Math.min(maxAgeMs, DEFAULT_MAX_AGE_MS)
          : DEFAULT_MAX_AGE_MS;
      work = hub.registerTab(sender.tab?.id).then(() => refresh(age));
    } else if (type === "toggle") {
      work = hub.registerTab(sender.tab?.id).then(() => serialized(() => toggle(task)));
    } else {
      return false;
    }
    work.then(sendResponse, (error: Error) => sendResponse({ ok: false, error: error.message }));
    return true; // keep the channel open for the async response
  });

  // Settings changed in the options page → re-check what is running, reload projects.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      projectCache.clear();
      void refresh(0);
    }
  });
});
