import { browser } from "wxt/browser";
import type { ProjectMapping } from "./core/projectResolver";
import { SolidtimeClient } from "./core/solidtime";
import { parseInstanceUrl } from "./core/validate";

export interface Settings {
  baseUrl: string;
  token: string;
  organizationId: string;
  memberId: string;
  billable: boolean;
  /** Pick the Solidtime project whose name appears in the ClickUp List/Space name. */
  autoMatch: boolean;
  mapping: ProjectMapping;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: "",
  token: "",
  organizationId: "",
  memberId: "",
  billable: false,
  autoMatch: true,
  mapping: { lists: {}, spaces: {}, defaultProjectId: null },
};

const KEY = "settings";

export async function loadSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get(KEY))[KEY] as Partial<Settings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    mapping: { ...DEFAULT_SETTINGS.mapping, ...stored?.mapping },
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [KEY]: settings });
}

/**
 * The stored URL passes today's rules unchanged. Checked before every use of the
 * token, so a tampered or legacy value can never send it over http.
 */
export function hasValidInstanceUrl(settings: Pick<Settings, "baseUrl">): boolean {
  try {
    return parseInstanceUrl(settings.baseUrl) === settings.baseUrl;
  } catch {
    return false;
  }
}

export function isConfigured(settings: Settings): boolean {
  return Boolean(settings.token && settings.organizationId && settings.memberId) && hasValidInstanceUrl(settings);
}

export function createClient(settings: Pick<Settings, "baseUrl" | "token">): SolidtimeClient {
  return new SolidtimeClient({ baseUrl: settings.baseUrl, token: settings.token });
}

export function originPattern(baseUrl: string): string {
  return `${new URL(baseUrl).origin}/*`;
}
