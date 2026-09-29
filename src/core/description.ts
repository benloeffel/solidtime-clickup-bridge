/**
 * Time entry description format shared with the old Clockify workflow:
 *   "Title of an awesome task | #86c1abcde"
 */
import { collapseWhitespace } from "./text";

const SEPARATOR = " | #";

export function formatDescription(title: string, taskId: string): string {
  const cleanTitle = collapseWhitespace(title);
  const id = taskId.trim().replace(/^#/, "");
  return cleanTitle ? `${cleanTitle}${SEPARATOR}${id}` : `#${id}`;
}

/**
 * Returns the ClickUp task id at the end of a description, or null.
 * Anchored at the end, so titles may themselves contain " | #".
 */
export function extractTaskId(description: string | null | undefined): string | null {
  if (!description) return null;
  return description.trim().match(/(?:^| \| )#([A-Za-z0-9][A-Za-z0-9_-]*)$/)?.[1] ?? null;
}
