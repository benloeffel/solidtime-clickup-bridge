// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { findRows, readDetailTask, readRowTask } from "../../src/clickup/read";
import { loadFixture } from "../support/loadFixture";

describe("readDetailTask", () => {
  it("reads the task open in a modal over the list view", () => {
    loadFixture("synthetic/list-with-task-modal.html", "https://app.clickup.com/t/86c1aaaaa");
    expect(readDetailTask()).toEqual({
      id: "86c1aaaaa",
      title: "Fix login redirect loop",
      location: { space: "Engineering", list: "Sprint Backlog" },
    });
  });

  it("prefers the displayed custom task id", () => {
    loadFixture("synthetic/task-page-custom-id.html", "https://app.clickup.com/t/9012345/MKT-42");
    expect(readDetailTask()).toEqual({
      id: "MKT-42",
      title: "Ship the release notes",
      location: { space: "Marketing", list: "Launches" },
    });
  });

  it("falls back to the URL id and tab title when the header markup changes", () => {
    loadFixture("synthetic/task-page-custom-id.html", "https://app.clickup.com/t/86c1zzzzz");
    document.querySelector(".cu-task-id-button")?.remove();
    document.querySelector(".cu-task-title__overlay")?.remove();
    expect(readDetailTask()).toMatchObject({ id: "86c1zzzzz", title: "Ship the release notes" });
  });

  it("returns null on a list without an open task", () => {
    loadFixture("synthetic/list-only.html");
    expect(readDetailTask()).toBeNull();
  });
});

describe("readRowTask", () => {
  it("reads every loaded row with its list and space", () => {
    loadFixture("synthetic/list-only.html");
    const tasks = findRows().map(readRowTask);
    expect(tasks).toEqual([
      { id: "86c1aaaaa", title: "Fix login redirect loop", location: { space: "Engineering", list: "Sprint Backlog" } },
      { id: "86c1bbbbb", title: "Write | tricky #title", location: { space: "Engineering", list: "Sprint Backlog" } },
      null,
    ]);
  });
});

describe("real ClickUp 4 layouts", () => {
  const LIST = "northwind.de (Northwind Planung GmbH)";

  it("reads the List from the page header in a single-List view (rows are not grouped)", () => {
    loadFixture("synthetic/list-view-single-list.html", "https://app.clickup.com/9012345/v/l/6-900000000001-1");
    expect(findRows().map(readRowTask)).toEqual([
      { id: "86c1eeee1", title: "Update Impressum", location: { space: "Agency", list: LIST } },
      { id: "86c1eeee2", title: "Fix contact form", location: { space: "Agency", list: LIST } },
    ]);
  });

  it("reads the List from the page header when rows sit in a group without a List name (status groups)", () => {
    loadFixture("synthetic/list-view-single-list.html", "https://app.clickup.com/9012345/v/l/6-900000000001-1");
    const rows = findRows();
    const group = document.createElement("cu-list-group");
    rows[0]!.parentElement!.insertBefore(group, rows[0]!);
    rows.forEach((row) => group.appendChild(row));
    expect(readRowTask(findRows()[0]!)?.location).toEqual({ space: "Agency", list: LIST });
  });

  it("falls back to the page breadcrumbs when the header title is missing", () => {
    loadFixture("synthetic/list-view-single-list.html", "https://app.clickup.com/9012345/v/l/6-900000000001-1");
    document.querySelector('[data-test="location-editable__location-title"]')!.remove();
    expect(readRowTask(findRows()[0]!)?.location).toEqual({ space: "Agency", list: LIST });
  });

  it("reads compact task-header breadcrumbs that sit outside the task container", () => {
    loadFixture("synthetic/task-page-clickup4.html", "https://app.clickup.com/t/9012345/86c1eeee1");
    expect(readDetailTask()).toEqual({
      id: "86c1eeee1",
      title: "Update Impressum",
      location: { space: "Agency", list: LIST },
    });
  });

  it("keeps the List but not a Space from unrelated page breadcrumbs", () => {
    loadFixture("synthetic/task-page-clickup4.html", "https://app.clickup.com/t/9012345/86c1eeee1");
    document.querySelectorAll("cu-breadcrumb-item span")[1]!.textContent = "Some other List";
    expect(readDetailTask()?.location).toEqual({ space: null, list: LIST });
  });
});

describe("tasks with a custom id", () => {
  it("uses the displayed custom id and keeps the native id as an alias", () => {
    loadFixture("synthetic/list-with-task-modal.html", "https://app.clickup.com/t/86c1aaaaa");
    document.querySelector(".cu-task-id-button__label")!.textContent = "#WEB-7";
    expect(readDetailTask()).toMatchObject({ id: "WEB-7", aliases: ["86c1aaaaa"] });
  });
});
