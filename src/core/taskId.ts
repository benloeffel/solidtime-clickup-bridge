/**
 * ClickUp task ids: native ("86c1abcde") or custom ("DEV-42"). A task can be
 * known by both, e.g. the task view shows the custom id while a List row links
 * to the native one, so comparisons work on sets of ids.
 */

const ID = "[A-Za-z0-9][A-Za-z0-9_-]{0,63}";
const EXACT = new RegExp(`^${ID}$`);
const FIRST_IN_TEXT = new RegExp(ID);

export function isValidTaskId(value: unknown): value is string {
  return typeof value === "string" && EXACT.test(value);
}

/** The first id-shaped token in a label such as "#DEV-42" or "Task ID: 86c1abcde". */
export function findTaskIdInText(text: string | null | undefined): string | null {
  return text?.match(FIRST_IN_TEXT)?.[0] ?? null;
}

export function sameTaskId(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.replace(/^#/, "").toLowerCase() === b.replace(/^#/, "").toLowerCase();
}

/** True when any id in `a` identifies the same task as any id in `b`. */
export function sharesTaskId(
  a: readonly (string | null | undefined)[],
  b: readonly (string | null | undefined)[],
): boolean {
  return a.some((x) => b.some((y) => sameTaskId(x, y)));
}

/** Distinct valid ids (case-insensitive), first occurrence wins. */
export function uniqueTaskIds(ids: readonly (string | null | undefined)[]): string[] {
  const result: string[] = [];
  for (const id of ids) {
    if (isValidTaskId(id) && !result.some((existing) => sameTaskId(existing, id))) result.push(id);
  }
  return result;
}
