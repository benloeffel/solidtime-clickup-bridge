/**
 * Validation for data crossing a trust boundary: the ClickUp page (DOM
 * content can be authored by anyone in the workspace) → content script →
 * background, and user input in the options page.
 */
import { isValidTaskId, uniqueTaskIds } from "./taskId";
import { collapseWhitespace, truncate } from "./text";
import type { ClickUpTask } from "./timerToggle";

/** Solidtime rejects descriptions longer than 5000 characters. */
export const MAX_TITLE_LENGTH = 1000;
export const MAX_NAME_LENGTH = 200;
const MAX_ALIASES = 4;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = collapseWhitespace(
    value
      // Control characters and line/paragraph separators → space.
      .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
      // Invisible format characters (bidi overrides, zero-width) → removed; keep ZWJ for emoji.
      .replace(/(?!\u200d)\p{Cf}/gu, ""),
  );
  return text ? truncate(text, max) : null;
}

/** Returns a sanitised copy of a task received from a content script, or null if it is malformed. */
export function sanitizeTask(input: unknown): ClickUpTask | null {
  if (typeof input !== "object" || input === null) return null;
  const { id, title, location, aliases } = input as Record<string, unknown>;
  if (!isValidTaskId(id)) return null;
  const cleanTitle = cleanText(title, MAX_TITLE_LENGTH);
  if (!cleanTitle) return null;
  const loc = typeof location === "object" && location !== null ? (location as Record<string, unknown>) : {};
  const otherIds = Array.isArray(aliases) ? uniqueTaskIds([id, ...aliases.slice(0, MAX_ALIASES)]).slice(1) : [];
  return {
    id,
    title: cleanTitle,
    ...(otherIds.length ? { aliases: otherIds } : {}),
    location: { space: cleanText(loc.space, MAX_NAME_LENGTH), list: cleanText(loc.list, MAX_NAME_LENGTH) },
  };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class InstanceUrlError extends Error {}

/**
 * Normalises the Solidtime URL. HTTPS is required because the API token is
 * sent with every request; plain HTTP is only accepted for loopback addresses.
 * Credentials, query strings and fragments are rejected.
 */
export function parseInstanceUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new InstanceUrlError("Enter the full URL, e.g. https://time.example.com");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) {
    throw new InstanceUrlError("Use an https:// URL. Your API token would be sent unencrypted over http.");
  }
  if (url.username || url.password) throw new InstanceUrlError("Remove the username/password from the URL.");
  if (url.search || url.hash) throw new InstanceUrlError("Remove the ?query or #fragment from the URL.");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
