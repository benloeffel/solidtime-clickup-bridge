import { hasNameMatch, type TaskLocation } from "../core/projectResolver";
import type { Project, SolidtimeClient } from "../core/solidtime";

const MAX_AGE_MS = 5 * 60_000;
/** A cached list older than this is re-fetched when it has no match, to pick up new projects. */
const MISS_REFRESH_AFTER_MS = 15_000;

export interface ProjectsForMatching {
  projects: Project[];
  /** False when the list could not be loaded (the cached copy, if any, is used). */
  loaded: boolean;
}

/** Organization projects for name-based matching, cached per organization. */
export function createProjectCache(now: () => number = Date.now) {
  let cache: { organizationId: string; at: number; projects: Project[] } | null = null;

  return {
    clear(): void {
      cache = null;
    },

    async forMatching(
      client: SolidtimeClient,
      organizationId: string,
      location: TaskLocation,
    ): Promise<ProjectsForMatching> {
      if (cache && cache.organizationId === organizationId) {
        const age = now() - cache.at;
        const fresh = age < MAX_AGE_MS && (age < MISS_REFRESH_AFTER_MS || hasNameMatch(location, cache.projects));
        if (fresh) return { projects: cache.projects, loaded: true };
      }
      const previous = cache?.organizationId === organizationId ? cache.projects : [];
      try {
        const projects = await client.getProjects(organizationId);
        cache = { organizationId, at: now(), projects };
        return { projects, loaded: true };
      } catch {
        return { projects: previous, loaded: false };
      }
    },
  };
}
