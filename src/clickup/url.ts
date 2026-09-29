/**
 * Returns the task id from a ClickUp task link:
 *   https://app.clickup.com/t/86c1abcde          → "86c1abcde"
 *   https://app.clickup.com/t/9012345/DEV-42     → "DEV-42" (custom id, after the workspace id)
 */
export function parseTaskUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href, "https://app.clickup.com");
  } catch {
    return null;
  }
  if (!/(^|\.)clickup\.com$/.test(url.hostname)) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const taskSegmentIndex = segments.indexOf("t");
  if (taskSegmentIndex === -1) return null;
  const [first, second] = segments.slice(taskSegmentIndex + 1);
  if (!first) return null;
  return decodeURIComponent(second && /^\d+$/.test(first) ? second : first);
}
