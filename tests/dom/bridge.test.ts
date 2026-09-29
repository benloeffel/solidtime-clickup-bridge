// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridge, type Bridge } from "../../src/clickup/bridge";
import type { ClickUpTask } from "../../src/core/timerToggle";
import { loadFixture } from "../support/loadFixture";

let bridge: Bridge | null = null;
afterEach(() => bridge?.disconnect());

const hosts = (variant: "detail" | "row") =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-solidtime-bridge="${variant}"]`));
const innerButton = (host: HTMLElement) => host.shadowRoot!.querySelector("button")!;

function start(onToggle = vi.fn(async (_task: ClickUpTask) => {})) {
  bridge = createBridge(document, onToggle, { requireTrustedClicks: false });
  bridge.sync();
  return onToggle;
}

describe("createBridge", () => {
  it("ignores clicks that page scripts synthesise", () => {
    loadFixture("synthetic/list-with-task-modal.html", "https://app.clickup.com/t/86c1aaaaa");
    const onToggle = vi.fn(async () => {});
    bridge = createBridge(document, onToggle);
    bridge.sync();
    hosts("detail")[0]!.click();
    hosts("detail")[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("adds one detail button and one button per loaded row", () => {
    loadFixture("synthetic/list-with-task-modal.html", "https://app.clickup.com/t/86c1aaaaa");
    start();
    expect(hosts("detail")).toHaveLength(1);
    expect(hosts("detail")[0]!.parentElement?.className).toBe("cu-task-view-header__left");
    expect(hosts("row").map((h) => h.dataset.taskId)).toEqual(["86c1aaaaa", "86c1bbbbb"]);
  });

  it("is idempotent across repeated syncs", () => {
    loadFixture("synthetic/list-with-task-modal.html", "https://app.clickup.com/t/86c1aaaaa");
    start();
    bridge!.sync();
    bridge!.sync();
    expect(hosts("detail")).toHaveLength(1);
    expect(hosts("row")).toHaveLength(2);
  });

  it("places row buttons before the status cell", () => {
    loadFixture("synthetic/list-only.html");
    start();
    const host = hosts("row")[0]!;
    expect(host.nextElementSibling?.getAttribute("data-test")).toBe("task-row-status__limited-edit-status");
  });

  it("marks the tracked task as running everywhere it appears", () => {
    loadFixture("synthetic/list-with-task-modal.html", "https://app.clickup.com/t/86c1aaaaa");
    start();
    bridge!.setActiveTaskIds(["86C1AAAAA"]);
    expect(hosts("detail")[0]!.dataset.state).toBe("running");
    expect(hosts("row").map((h) => h.dataset.state)).toEqual(["running", "idle"]);
    expect(innerButton(hosts("detail")[0]!).textContent).toContain("Stop timer");
    bridge!.setActiveTaskIds([]);
    expect(innerButton(hosts("detail")[0]!).textContent).toContain("Start timer");
  });

  it("passes the task to the toggle handler and shows a busy state meanwhile", async () => {
    loadFixture("synthetic/list-with-task-modal.html", "https://app.clickup.com/t/86c1aaaaa");
    let finish!: () => void;
    const onToggle = start(vi.fn(() => new Promise<void>((resolve) => (finish = resolve))));
    const host = hosts("detail")[0]!;
    host.click();
    expect(onToggle).toHaveBeenCalledWith({
      id: "86c1aaaaa",
      title: "Fix login redirect loop",
      location: { space: "Engineering", list: "Sprint Backlog" },
    });
    expect(host.dataset.state).toBe("busy");
    host.click(); // ignored while busy
    hosts("row")[1]!.click(); // other tasks wait too
    expect(onToggle).toHaveBeenCalledTimes(1);
    finish();
    await vi.waitFor(() => expect(host.dataset.state).toBe("idle"));
  });

  it("does not let a row click bubble up to ClickUp's row link", () => {
    loadFixture("synthetic/list-only.html");
    const rowClick = vi.fn();
    document.querySelector(".cu-task-row")!.addEventListener("click", rowClick);
    const onToggle = start();
    hosts("row")[1]!.click();
    expect(rowClick).not.toHaveBeenCalled();
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: "86c1bbbbb", title: "Write | tricky #title" }));
  });

  it("follows SPA changes: switching tasks and closing the modal", async () => {
    loadFixture("synthetic/list-with-task-modal.html", "https://app.clickup.com/t/86c1aaaaa");
    start();
    // ClickUp reuses the header and swaps the content when you open another task.
    document.querySelector(".cu-task-id-button__label")!.textContent = "86c1bbbbb";
    document.querySelector(".cu-task-title__overlay")!.textContent = "Another task";
    await vi.waitFor(() => expect(hosts("detail")[0]!.dataset.taskId).toBe("86c1bbbbb"));

    document.querySelector('[role="dialog"]')!.remove();
    await vi.waitFor(() => expect(hosts("detail")).toHaveLength(0));
    expect(hosts("row")).toHaveLength(2);
  });

  it("picks up rows that render later (virtual scrolling)", async () => {
    loadFixture("synthetic/list-only.html");
    start();
    const loading = document.querySelectorAll(".cu-task-row__main")[2]!;
    loading.innerHTML =
      '<a class="cu-task-row-main__link" href="/t/86c1ccccc"><span class="cu-task-row-main__link-text-inner">Late row</span></a>';
    await vi.waitFor(() => expect(hosts("row").map((h) => h.dataset.taskId)).toContain("86c1ccccc"));
  });
});

describe("click-time reading", () => {
  it("sends the task as it is on the page at click time, not as last synced", () => {
    loadFixture("synthetic/list-only.html");
    const onToggle = start();
    document.querySelector('[data-test^="list-group-name"]')!.textContent = "Renamed List";
    hosts("row")[0]!.click(); // before the debounced sync runs
    expect(onToggle).toHaveBeenCalledWith(
      expect.objectContaining({ location: expect.objectContaining({ list: "Renamed List" }) }),
    );
  });
});

describe("tasks known by several ids", () => {
  it("marks a row running when the timer was started under the task's custom id", () => {
    loadFixture("synthetic/list-only.html");
    start();
    bridge!.setActiveTaskIds(["MKT-42", "86c1bbbbb"]);
    expect(hosts("row").map((h) => h.dataset.state)).toEqual(["idle", "running"]);
  });
});
