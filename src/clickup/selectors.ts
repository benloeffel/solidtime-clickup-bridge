import { collapseWhitespace } from "../core/text";

/**
 * Every ClickUp-specific selector lives here. When ClickUp ships a UI change,
 * re-capture fixtures (npm run capture-fixtures), see which DOM tests fail,
 * and adjust this file. First match wins.
 */
export const SELECTORS = {
  /** Header of the open task (modal, side panel or full page) where the button goes. */
  detailAnchor: [
    ".cu-task-view__container .cu-task-view-header__left",
    '[data-test="task-view-header__left"]',
    ".cu-task-view-header__left",
  ],
  /** Container of the open task, used to scope the lookups below. */
  detailContainer: [".cu-task-view__container", '[data-test="task-view"]', 'div[role="dialog"][data-task-id]'],
  detailTitle: [
    ".cu-task-title__overlay",
    '[data-test="task-title__title-overlay"]',
    '[data-test="task-title__container"] [contenteditable]',
    "h1.task-name",
  ],
  /** Shows the custom task id when enabled, otherwise the native id. */
  detailTaskId: [".cu-task-id-button__label", '[data-test="cu-task-view-task-label__task-id"]', "cu-hidden-task-id"],
  /**
   * Breadcrumbs in the task header ("Space › Folder › List", or only the List in
   * ClickUp 4's compact header). They may sit outside detailContainer.
   */
  taskBreadcrumbs: ['span[class*="cu-task-view-breadcrumbs"]:not([class$="__icon"])'],

  /** Page-level location of the current view, e.g. "Space › List" when a List is open. */
  pageBreadcrumbs: ["cu-breadcrumb-item span:not(.avatar-initials)"],
  /** Title of the List/Folder/Space whose view is open (page header). */
  pageLocationTitle: ['[data-test="location-editable__location-title"]'],

  /** List view */
  row: [".cu-task-row__main", '[data-test="task-row-main"]'],
  rowHover: ".cu-task-row",
  rowLink: [".cu-task-row-main__link", 'a[href*="/t/"]'],
  rowTitle: [".cu-task-row-main__link-text-inner", ".cu-task-row-main__link-text"],
  /** Where the row button is inserted before (falls back to appending to the row). */
  rowAnchor: ['[data-test="task-row-status__limited-edit-status"]', ".cu-task-row__status"],
  listGroup: "cu-list-group",
  listGroupName: ['[data-test*="list-group-name"]', ".cu-list-group__name"],
  /** "Space / Folder" path above a list group (grouped views such as Everything or a Space). */
  listGroupPath: [".cu-list-group__header-breadcrumbs"],
} as const;

export function queryFirst<T extends Element = HTMLElement>(root: ParentNode, selectors: readonly string[]): T | null {
  for (const selector of selectors) {
    const element = root.querySelector<T>(selector);
    if (element) return element;
  }
  return null;
}

export function textOf(root: ParentNode, selectors: readonly string[]): string | null {
  const text = queryFirst(root, selectors)?.textContent;
  return text ? collapseWhitespace(text) || null : null;
}
