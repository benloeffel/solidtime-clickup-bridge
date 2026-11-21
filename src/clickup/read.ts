import type { TaskLocation } from "../core/projectResolver";
import { findTaskIdInText, uniqueTaskIds } from "../core/taskId";
import { collapseWhitespace } from "../core/text";
import type { ClickUpTask } from "../core/timerToggle";
import { parseTaskUrl } from "./url";
import { queryFirst, SELECTORS, textOf } from "./selectors";

/**
 * Reads the task that is currently open in the task view (modal, panel or full page).
 * The id label (custom id when enabled) is the display id; the URL and the
 * container's data-task-id (native id) become aliases of the same task.
 */
export function readDetailTask(doc: Document = document): ClickUpTask | null {
  const container = queryFirst(doc, SELECTORS.detailContainer) ?? doc;
  const urlTaskId = parseTaskUrl(doc.location?.href);

  const [id, ...aliases] = uniqueTaskIds([
    findTaskIdInText(textOf(container, SELECTORS.detailTaskId)),
    urlTaskId,
    container instanceof Element ? container.getAttribute("data-task-id") : null,
  ]);

  const title = textOf(container, SELECTORS.detailTitle) ?? titleFromDocument(doc, urlTaskId !== null);
  if (!id || !title) return null;

  return { id, ...(aliases.length ? { aliases } : {}), title, location: readDetailLocation(doc, container) };
}

/** Distinct, non-empty texts of all matches, in document order. */
function crumbsIn(root: ParentNode, selectors: readonly string[]): string[] {
  const texts = Array.from(root.querySelectorAll(selectors.join(",")))
    .map((el) => collapseWhitespace(el.textContent ?? ""))
    .filter((text) => text && text !== "..." && text !== "/");
  return texts.filter((text, i) => texts.indexOf(text) === i);
}

/** "Space › List" or "Space › Folder › List": the Folder is the crumb right before the List. */
function folderOf(crumbs: readonly string[]): string | null {
  return crumbs.length >= 3 ? crumbs[crumbs.length - 2]! : null;
}

function withFolder(location: TaskLocation, folder: string | null): TaskLocation {
  return folder ? { ...location, folder } : location;
}

/**
 * Task header breadcrumbs end with the List. They are looked up inside the task
 * container first (a modal over another view), then anywhere on the page (ClickUp 4
 * renders the header outside the container). The compact header only shows the List;
 * the Space and Folder then come from the page breadcrumbs when they lead to the same List.
 */
function readDetailLocation(doc: Document, container: ParentNode): TaskLocation {
  const crumbs = [container, doc].map((root) => crumbsIn(root, SELECTORS.taskBreadcrumbs)).find((c) => c.length > 0);
  const page = crumbsIn(doc, SELECTORS.pageBreadcrumbs);
  if (!crumbs) return pageLocation(doc, page);

  const list = crumbs[crumbs.length - 1] ?? null;
  if (crumbs.length >= 2) return withFolder({ space: crumbs[0]!, list }, folderOf(crumbs));
  if (page.length >= 2 && page[page.length - 1] === list) return withFolder({ space: page[0]!, list }, folderOf(page));
  return { space: null, list };
}

/** Location of the view that is open: "Space › (Folder ›) List" breadcrumbs and the page title. */
function pageLocation(doc: Document, page = crumbsIn(doc, SELECTORS.pageBreadcrumbs)): TaskLocation {
  const title = textOf(doc, SELECTORS.pageLocationTitle);
  const location = {
    space: page.length >= 2 ? page[0]! : null,
    list: title ?? (page.length >= 2 ? page[page.length - 1]! : null),
  };
  return withFolder(location, location.list === page[page.length - 1] ? folderOf(page) : null);
}

/** ClickUp sets the tab title to "Task name | ClickUp" on task pages. */
function titleFromDocument(doc: Document, onTaskUrl: boolean): string | null {
  if (!onTaskUrl) return null;
  const title = doc.title.split(" | ")[0]?.trim();
  return title && title !== "ClickUp" ? title : null;
}

/** Reads a task from a List view row. */
export function readRowTask(row: Element): ClickUpTask | null {
  const link = queryFirst<HTMLAnchorElement>(row, SELECTORS.rowLink);
  const id = parseTaskUrl(link?.getAttribute("href"));
  const title = textOf(row, SELECTORS.rowTitle) ?? (collapseWhitespace(link?.textContent ?? "") || null);
  if (!id || !title) return null;

  // Grouped views (Everything, Space) have a header per List. In a single List view
  // the List is the page itself; its rows may still sit in groups (e.g. per status)
  // whose headers name no List.
  const group = row.closest(SELECTORS.listGroup);
  const list = group ? textOf(group, SELECTORS.listGroupName) : null;
  if (!group || !list) return { id, title, location: pageLocation(row.ownerDocument) };

  const [space, folder] = (textOf(group, SELECTORS.listGroupPath) ?? "").split("/").map((part) => part.trim());
  return { id, title, location: withFolder({ space: space || null, list }, folder || null) };
}

export function findDetailAnchor(doc: Document = document): HTMLElement | null {
  return queryFirst(doc, SELECTORS.detailAnchor);
}

export function findRows(doc: Document = document): HTMLElement[] {
  for (const selector of SELECTORS.row) {
    const rows = Array.from(doc.querySelectorAll<HTMLElement>(selector));
    if (rows.length) return rows;
  }
  return [];
}
