import { describe, expect, it } from "vitest";
import { containsWhole, matchProjectByName, resolveProject, type ProjectMapping } from "../../src/core/projectResolver";

const mapping: ProjectMapping = {
  lists: { "Sprint Backlog": "p-list" },
  spaces: { Engineering: "p-space" },
  defaultProjectId: "p-default",
};

describe("resolveProject", () => {
  it("prefers the List mapping", () => {
    expect(resolveProject({ space: "Engineering", list: "Sprint Backlog" }, mapping).projectId).toBe("p-list");
  });

  it("falls back to the Space mapping", () => {
    expect(resolveProject({ space: "Engineering", list: "Other" }, mapping).projectId).toBe("p-space");
  });

  it("matches names case- and whitespace-insensitively", () => {
    expect(resolveProject({ list: "  sprint backlog " }, mapping).projectId).toBe("p-list");
  });

  it("falls back to the default project", () => {
    expect(resolveProject({ space: "Marketing" }, mapping).projectId).toBe("p-default");
  });

  it("returns null without any match or default", () => {
    expect(resolveProject({}, { lists: {}, spaces: {}, defaultProjectId: null }).projectId).toBeNull();
  });

  it("ignores empty mapped values", () => {
    expect(resolveProject({ list: "Empty" }, { ...mapping, lists: { Empty: "" } }).projectId).toBe("p-default");
  });
});

describe("containsWhole", () => {
  it.each([
    ["example.com – Website", "example.com"],
    ["Website (example.com)", "example.com"],
    ["[example.com] Retainer", "EXAMPLE.COM"],
    ["example.com", "example.com"],
    ["Support for Acme", "acme"],
    ["Ärzte Müller – Praxis", "ärzte müller"],
    ["Site: example.com.", "example.com"], // trailing sentence period
  ])("finds %j in %j", (haystack, needle) => {
    expect(containsWhole(haystack, needle)).toBe(true);
  });

  it.each([
    ["shop.example.com", "example.com"],
    ["example.com.au", "example.com"],
    ["example.community", "example.com"],
    ["myexample.com", "example.com"],
    ["Happy path tests", "app"],
    ["anything", ""],
    ["anything", "   "],
  ])("does not find %j in %j", (haystack, needle) => {
    expect(containsWhole(haystack, needle)).toBe(false);
  });
});

describe("matchProjectByName", () => {
  const projects = [
    { id: "p-acme", name: "Acme" },
    { id: "p-acme-corp", name: "Acme Corp" },
    { id: "p-domain", name: "example.com" },
    { id: "p-shop", name: "shop.example.com" },
    { id: "p-blank", name: "  " },
  ];

  it("prefers the longest matching name", () => {
    expect(matchProjectByName("Acme Corp retainer", projects)).toBe("p-acme-corp");
    expect(matchProjectByName("Support for Acme", projects)).toBe("p-acme");
    expect(matchProjectByName("shop.example.com – Checkout", projects)).toBe("p-shop");
    expect(matchProjectByName("example.com – Website", projects)).toBe("p-domain");
  });

  it("refuses to guess between equally long different projects", () => {
    expect(
      matchProjectByName("Alpha vs Omega", [
        { id: "a", name: "Alpha" },
        { id: "o", name: "Omega" },
      ]),
    ).toBeNull();
  });

  it("returns null without a name or match", () => {
    expect(matchProjectByName(null, projects)).toBeNull();
    expect(matchProjectByName("Internal", projects)).toBeNull();
  });
});

describe("resolveProject with name matching", () => {
  const projects = [
    { id: "p-domain", name: "example.com" },
    { id: "p-eng", name: "Engineering" },
  ];
  const empty: ProjectMapping = { lists: {}, spaces: {}, defaultProjectId: "p-default" };

  it("matches the List name first", () => {
    expect(resolveProject({ space: "Engineering", list: "example.com – Website" }, empty, projects).projectId).toBe(
      "p-domain",
    );
  });

  it("falls back to the Space name, then the default", () => {
    expect(resolveProject({ space: "Engineering", list: "Backlog" }, empty, projects).projectId).toBe("p-eng");
    expect(resolveProject({ space: "Ops", list: "Backlog" }, empty, projects).projectId).toBe("p-default");
  });

  it("lets manual mappings win over automatic matches", () => {
    const manual: ProjectMapping = { lists: {}, spaces: { Engineering: "p-manual" }, defaultProjectId: null };
    expect(resolveProject({ space: "Engineering", list: "example.com – Website" }, manual, projects).projectId).toBe(
      "p-manual",
    );
  });

  it("does not match names when no projects are passed (auto-match off)", () => {
    expect(resolveProject({ list: "example.com – Website" }, empty, []).projectId).toBe("p-default");
  });
});

it("matches a real-world List name to its domain project", () => {
  const projects = [
    { id: "p-northwind", name: "northwind.de" },
    { id: "p-other", name: "northwind.com" },
  ];
  expect(
    resolveProject(
      { space: "Agency", list: "northwind.de (Northwind Planung GmbH)" },
      { lists: {}, spaces: {}, defaultProjectId: null },
      projects,
    ).projectId,
  ).toBe("p-northwind");
});

describe("resolveProject reports which rule applied", () => {
  const projects = [{ id: "p-domain", name: "example.com" }];
  const mapping: ProjectMapping = {
    lists: { Sprint: "p-list" },
    spaces: { Ops: "p-space" },
    defaultProjectId: "p-default",
  };
  it.each([
    [{ list: "Sprint", space: "Ops" }, "list-mapping", "p-list"],
    [{ list: "Other", space: "Ops" }, "space-mapping", "p-space"],
    [{ list: "example.com – Site", space: "X" }, "list-name", "p-domain"],
    [{ list: "Backlog", space: "example.com" }, "space-name", "p-domain"],
    [{ list: "Backlog", space: "X" }, "default", "p-default"],
  ] as const)("%j → %s", (location, source, projectId) => {
    expect(resolveProject(location, mapping, projects)).toEqual({ source, projectId });
  });

  it("reports none when nothing applies", () => {
    expect(resolveProject({ list: "Backlog" }, { lists: {}, spaces: {}, defaultProjectId: null }, projects)).toEqual({
      source: "none",
      projectId: null,
    });
  });
});
