// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridge, type Bridge } from "../../src/clickup/bridge";
import { findRows, readDetailTask, readRowTask } from "../../src/clickup/read";
import { loadFixture } from "../support/loadFixture";

const LIST = "northwind.de (Northwind Planung GmbH)";

/** Inserts a Folder crumb into the page breadcrumbs: "Agency › Clients › <List>". */
function addPageFolderCrumb(name = "Clients") {
  const item = document.createElement("cu-breadcrumb-item");
  item.innerHTML = `<span>${name}</span>`;
  const crumbs = document.querySelectorAll("cu-breadcrumb-item");
  crumbs[crumbs.length - 1]!.before(item);
}

describe("reading the Folder", () => {
  it("reads Space › Folder › List from the task header breadcrumbs", () => {
    loadFixture("synthetic/task-page-folder.html", "https://app.clickup.com/t/9012345/86c1fffff");
    expect(readDetailTask()).toEqual({
      id: "86c1fffff",
      title: "Fix checkout total",
      location: { space: "Clients", folder: "Acme", list: "Bugs" },
    });
  });

  it("takes the Folder from the page breadcrumbs when the compact header only shows the List", () => {
    loadFixture("synthetic/task-page-clickup4.html", "https://app.clickup.com/t/9012345/86c1eeee1");
    addPageFolderCrumb();
    expect(readDetailTask()?.location).toEqual({ space: "Agency", folder: "Clients", list: LIST });
  });

  it("reads List view rows with the Folder from the page breadcrumbs", () => {
    loadFixture("synthetic/list-view-single-list.html", "https://app.clickup.com/9012345/v/l/6-900000000001-1");
    addPageFolderCrumb();
    expect(findRows().map((row) => readRowTask(row)?.location)).toEqual([
      { space: "Agency", folder: "Clients", list: LIST },
      { space: "Agency", folder: "Clients", list: LIST },
    ]);
  });

  it("leaves the Folder out when the page title is not the last breadcrumb (e.g. a Folder view)", () => {
    loadFixture("synthetic/list-view-single-list.html", "https://app.clickup.com/9012345/v/l/6-900000000001-1");
    addPageFolderCrumb();
    document.querySelector('[data-test="location-editable__location-title"]')!.textContent = "Clients";
    expect(readRowTask(findRows()[0]!)?.location).toEqual({ space: "Agency", list: "Clients" });
  });

  it("has no Folder for a List directly in a Space", () => {
    loadFixture("synthetic/list-view-single-list.html", "https://app.clickup.com/9012345/v/l/6-900000000001-1");
    expect(readRowTask(findRows()[0]!)?.location).not.toHaveProperty("folder");
  });
});

describe("tooltip", () => {
  let bridge: Bridge | null = null;
  afterEach(() => bridge?.disconnect());

  it("shows the Folder and List the project is matched on", () => {
    loadFixture("synthetic/task-page-folder.html", "https://app.clickup.com/t/9012345/86c1fffff");
    bridge = createBridge(
      document,
      vi.fn(async () => {}),
      { requireTrustedClicks: false },
    );
    bridge.sync();
    const host = document.querySelector<HTMLElement>('[data-solidtime-bridge="detail"]')!;
    expect(host.shadowRoot!.querySelector("button")!.title).toBe(
      "Start timer in Solidtime · Folder: Acme · List: Bugs",
    );
  });
});
