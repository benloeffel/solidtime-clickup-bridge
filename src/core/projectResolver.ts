export interface ProjectMapping {
  /** ClickUp List name → Solidtime project id */
  lists: Record<string, string>;
  /** ClickUp Space name → Solidtime project id */
  spaces: Record<string, string>;
  defaultProjectId: string | null;
}

export interface TaskLocation {
  space?: string | null;
  list?: string | null;
}

export interface NamedProject {
  id: string;
  name: string;
}

/** Which rule chose the project (or that none applied). */
export type ProjectSource = "list-mapping" | "space-mapping" | "list-name" | "space-name" | "default" | "none";

export interface ProjectResolution {
  projectId: string | null;
  source: ProjectSource;
}

const normalize = (name: string) => name.trim().toLowerCase();

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);

function lookup(map: Record<string, string>, name: string | null | undefined): string | null {
  if (!name) return null;
  const wanted = normalize(name);
  for (const [key, projectId] of Object.entries(map)) {
    if (normalize(key) === wanted && projectId) return projectId;
  }
  return null;
}

/**
 * True when `needle` occurs in `haystack` as a whole word/domain:
 * "example.com" matches "example.com – Website" but not "shop.example.com"
 * or "example.community"; "App" does not match "Happy path".
 */
export function containsWhole(haystack: string, needle: string): boolean {
  const text = normalize(haystack);
  const word = normalize(needle);
  if (!word) return false;
  for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
    const before = text[i - 1];
    const after = text[i + word.length];
    const afterNext = text[i + word.length + 1];
    // A "." followed by a letter/digit continues a domain (sub.example.com / example.com.au).
    const joinsBefore = isWordChar(before) || (before === "." && isWordChar(text[i - 2]));
    const joinsAfter = isWordChar(after) || (after === "." && isWordChar(afterNext));
    if (!joinsBefore && !joinsAfter) return true;
  }
  return false;
}

/** The project whose name appears in `name`; the longest name wins, a tie between different projects is no match. */
export function matchProjectByName(name: string | null | undefined, projects: readonly NamedProject[]): string | null {
  if (!name) return null;
  const hits = projects.filter((project) => project.name.trim() && containsWhole(name, project.name));
  if (hits.length === 0) return null;
  const longest = Math.max(...hits.map((p) => normalize(p.name).length));
  const best = hits.filter((p) => normalize(p.name).length === longest);
  return best.length === 1 ? best[0]!.id : null;
}

/**
 * First match wins:
 * List mapping → Space mapping → auto-match in List name → auto-match in Space name → default.
 *
 * @param autoMatchProjects projects to match by name; empty when automatic matching is off.
 */
export function resolveProject(
  location: TaskLocation,
  mapping: ProjectMapping,
  autoMatchProjects: readonly NamedProject[] = [],
): ProjectResolution {
  const rules: [ProjectSource, () => string | null][] = [
    ["list-mapping", () => lookup(mapping.lists, location.list)],
    ["space-mapping", () => lookup(mapping.spaces, location.space)],
    ["list-name", () => matchProjectByName(location.list, autoMatchProjects)],
    ["space-name", () => matchProjectByName(location.space, autoMatchProjects)],
    ["default", () => mapping.defaultProjectId],
  ];
  for (const [source, rule] of rules) {
    const projectId = rule();
    if (projectId) return { projectId, source };
  }
  return { projectId: null, source: "none" };
}

/** True when name-based matching finds a project for this location. */
export function hasNameMatch(location: TaskLocation, projects: readonly NamedProject[]): boolean {
  return matchProjectByName(location.list, projects) !== null || matchProjectByName(location.space, projects) !== null;
}
