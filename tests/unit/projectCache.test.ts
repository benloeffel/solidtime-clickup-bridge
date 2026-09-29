import { describe, expect, it, vi } from "vitest";
import { createProjectCache } from "../../src/background/projectCache";
import type { Project, SolidtimeClient } from "../../src/core/solidtime";

const project = (id: string, name: string): Project => ({ id, name, color: "#000" });

function setup(initial: Project[]) {
  let time = 0;
  let projects = initial;
  const getProjects = vi.fn(async () => projects);
  const client = { getProjects } as unknown as SolidtimeClient;
  const cache = createProjectCache(() => time);
  return {
    cache,
    client,
    getProjects,
    advance: (ms: number) => (time += ms),
    setProjects: (next: Project[]) => (projects = next),
  };
}

describe("createProjectCache", () => {
  const location = { list: "newclient.com – Website" };

  it("reuses the cached list while it has a match", async () => {
    const t = setup([project("p1", "newclient.com")]);
    await t.cache.forMatching(t.client, "org", location);
    t.advance(60_000);
    await t.cache.forMatching(t.client, "org", location);
    expect(t.getProjects).toHaveBeenCalledTimes(1);
  });

  it("re-fetches on a miss, so a project created a minute ago is found", async () => {
    const t = setup([]);
    await t.cache.forMatching(t.client, "org", location);
    t.setProjects([project("p1", "newclient.com")]);
    t.advance(20_000);
    const result = await t.cache.forMatching(t.client, "org", location);
    expect(result).toEqual({ projects: [project("p1", "newclient.com")], loaded: true });
  });

  it("doesn't re-fetch on every click right after loading", async () => {
    const t = setup([]);
    await t.cache.forMatching(t.client, "org", location);
    t.advance(5_000);
    await t.cache.forMatching(t.client, "org", location);
    expect(t.getProjects).toHaveBeenCalledTimes(1);
  });

  it("falls back to the previous list when loading fails", async () => {
    const t = setup([project("p1", "newclient.com")]);
    await t.cache.forMatching(t.client, "org", { list: "other" });
    t.getProjects.mockRejectedValueOnce(new Error("offline"));
    t.advance(6 * 60_000);
    expect(await t.cache.forMatching(t.client, "org", location)).toEqual({
      projects: [project("p1", "newclient.com")],
      loaded: false,
    });
  });

  it("keeps organizations apart", async () => {
    const t = setup([project("p1", "newclient.com")]);
    await t.cache.forMatching(t.client, "org-a", location);
    await t.cache.forMatching(t.client, "org-b", location);
    expect(t.getProjects).toHaveBeenCalledTimes(2);
  });
});
