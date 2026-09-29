import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Available inside background.evaluate(), which runs in the extension service worker. */
declare const chrome: typeof import("wxt/browser").browser;

const detailButton = (page: Page) => page.locator('[data-solidtime-bridge="detail"]');
const rowButton = (page: Page, taskId: string) =>
  page.locator(`[data-solidtime-bridge="row"][data-task-id="${taskId}"]`);

test("starts a timer from the task view with the Clockify-style description and mapped project", async ({
  configure,
  clickup,
  fake,
}) => {
  await configure();
  const page = await clickup("/t/86c1aaaaa");

  await expect(detailButton(page)).toHaveAttribute("data-state", "idle");
  await detailButton(page)
    .getByRole("button", { name: /Start timer/ })
    .click();

  await expect(detailButton(page)).toHaveAttribute("data-state", "running");
  await expect(detailButton(page).getByRole("button")).toHaveText(/Stop timer/);
  await expect(rowButton(page, "86c1aaaaa")).toHaveAttribute("data-state", "running");
  expect(fake.running).toMatchObject({
    description: "Fix login redirect loop | #86c1aaaaa",
    project_id: "proj-client", // List "Sprint Backlog" → Client Work
    billable: false,
  });
});

test("clicking the tracked task again stops the timer", async ({ configure, clickup, fake }) => {
  await configure();
  const page = await clickup("/t/86c1aaaaa");
  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "running");

  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "idle");
  expect(fake.running).toBeUndefined();
  expect(fake.entries).toHaveLength(1);
});

test("a list row button switches the running timer to that task", async ({ configure, clickup, fake }) => {
  await configure();
  const page = await clickup("/t/86c1aaaaa");
  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "running");

  await page.locator(".cu-task-row").nth(1).hover();
  await rowButton(page, "86c1bbbbb").click();

  await expect(rowButton(page, "86c1bbbbb")).toHaveAttribute("data-state", "running");
  await expect(detailButton(page)).toHaveAttribute("data-state", "idle");
  expect(fake.entries.filter((e) => e.end === null)).toHaveLength(1);
  expect(fake.running?.description).toBe("Write | tricky #title | #86c1bbbbb");
  // Clicking the row button must not navigate to the task.
  expect(new URL(page.url()).pathname).toBe("/t/86c1aaaaa");
});

test("uses the custom task id and falls back to the default project", async ({ configure, clickup, fake }) => {
  await configure();
  const page = await clickup("/t/9012345/MKT-42");
  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "running");
  expect(fake.running).toMatchObject({ description: "Ship the release notes | #MKT-42", project_id: "proj-eng" });
});

test("stops a timer started elsewhere and shows state across tabs", async ({ configure, clickup, fake }) => {
  await configure({ mapping: false });
  await fetch(`${fake.url}/__test/start-external`, {
    method: "POST",
    body: JSON.stringify({ description: "Email triage" }),
  });

  const first = await clickup("/t/86c1aaaaa");
  const second = await clickup("/t/86c1aaaaa");
  await detailButton(second).click();

  await expect(detailButton(second)).toHaveAttribute("data-state", "running");
  await expect(detailButton(first)).toHaveAttribute("data-state", "running"); // broadcast via storage
  expect(fake.entries.find((e) => e.description === "Email triage")?.end).not.toBeNull();
  // No manual mapping: auto-match picks the project named like the Space ("Engineering").
  expect(fake.running).toMatchObject({ description: "Fix login redirect loop | #86c1aaaaa", project_id: "proj-eng" });
});

test("picks up a timer started in the desktop app when returning to the tab", async ({ configure, clickup, fake }) => {
  await configure();
  const page = await clickup("/");
  await expect(rowButton(page, "86c1bbbbb")).toHaveAttribute("data-state", "idle");

  await fetch(`${fake.url}/__test/start-external`, {
    method: "POST",
    body: JSON.stringify({ description: "Write | tricky #title | #86c1bbbbb" }),
  });
  // Focus events inside the background's 1s coalescing window reuse the cached state,
  // so keep "returning to the tab" until a fresh fetch happens.
  await expect(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(rowButton(page, "86c1bbbbb")).toHaveAttribute("data-state", "running", { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(rowButton(page, "86c1aaaaa")).toHaveAttribute("data-state", "idle");
});

test("keeps exactly one button through SPA re-renders", async ({ configure, clickup }) => {
  await configure();
  const page = await clickup("/t/86c1aaaaa");
  await expect(detailButton(page)).toHaveCount(1);

  await page.evaluate(() => {
    document.querySelector(".cu-task-id-button__label")!.textContent = "86c1ddddd";
    document.querySelector(".cu-task-title__overlay")!.textContent = "Opened another task";
    const header = document.querySelector(".cu-task-view-header__left")!;
    header.appendChild(document.createElement("span")); // unrelated churn
  });
  await expect(detailButton(page)).toHaveAttribute("data-task-id", "86c1ddddd");
  await expect(detailButton(page)).toHaveCount(1);
  await expect(page.locator('[data-solidtime-bridge="row"]')).toHaveCount(2);
});

test("opens the options page when clicked before setup", async ({ context, clickup, fake }) => {
  const page = await clickup("/t/86c1aaaaa");
  const optionsPage = context.waitForEvent("page");
  await detailButton(page).click();
  expect((await optionsPage).url()).toContain("/options.html");
  await expect(page.getByRole("alert")).toContainText("Set up Solidtime");
  expect(fake.entries).toHaveLength(0);
});

test("explains API errors in a toast", async ({ configure, clickup, background }) => {
  await configure();
  // Token revoked after setup.
  await background.evaluate(async () => {
    const { settings } = (await chrome.storage.local.get("settings")) as { settings: Record<string, unknown> };
    await chrome.storage.local.set({ settings: { ...settings, token: "revoked" } });
  });
  const page = await clickup("/t/86c1aaaaa");
  await detailButton(page).click();
  await expect(page.getByRole("alert")).toContainText("API token");
  await expect(detailButton(page)).toHaveAttribute("data-state", "idle");
});

test("ignores clicks synthesised by page scripts", async ({ configure, clickup, fake }) => {
  await configure();
  const page = await clickup("/t/86c1aaaaa");
  await expect(detailButton(page)).toHaveAttribute("data-state", "idle");
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-solidtime-bridge="detail"]')!;
    host.click();
    host.shadowRoot!.querySelector("button")!.click();
  });
  await page.waitForTimeout(500);
  expect(fake.entries).toHaveLength(0);
});

test("refuses to send the token over plain http", async ({ context, extensionId, fake }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.getByLabel("Solidtime URL").fill("http://time.example.com");
  await page.getByLabel("API token").fill("secret");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/Use an https:\/\/ URL/)).toBeVisible();
  expect(fake.requests).toHaveLength(0);
});

test("simultaneous clicks in two tabs leave exactly one running entry", async ({ configure, clickup, fake }) => {
  await configure();
  const taskTab = await clickup("/t/86c1aaaaa");
  const otherTab = await clickup("/t/9012345/MKT-42");
  await expect(detailButton(taskTab)).toHaveAttribute("data-state", "idle");
  await expect(detailButton(otherTab)).toHaveAttribute("data-state", "idle");

  await Promise.all([detailButton(taskTab).click(), detailButton(otherTab).click()]);

  await expect.poll(() => fake.entries.length).toBe(2);
  expect(fake.entries.filter((e) => e.end === null)).toHaveLength(1);
});

test("disconnect removes the token", async ({ configure, context, extensionId, background, clickup, fake }) => {
  await configure({ mapping: false });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByText("Connected.").waitFor();
  await options.getByRole("button", { name: "Disconnect" }).click();
  await expect(options.getByText(/Disconnected/)).toBeVisible();

  // (Permission removal can't be asserted here: E2E builds pre-grant 127.0.0.1 as a required permission.)
  const token = await background.evaluate(
    async () => ((await chrome.storage.local.get("settings")) as { settings: { token: string } }).settings.token,
  );
  expect(token).toBe("");

  const page = await clickup("/t/86c1aaaaa");
  await detailButton(page).click();
  await expect(page.getByRole("alert")).toContainText("Set up Solidtime");
  expect(fake.entries).toHaveLength(0);
});

test("auto-matches the project whose name appears in the List name", async ({ configure, clickup, fake }) => {
  await configure({ mapping: false });
  const page = await clickup("/");
  await page.evaluate(() => {
    document.querySelector('[data-test^="list-group-name"]')!.textContent = "example.com – Website";
  });
  // Click immediately after the re-render: the task is read at click time, not from a stale cache.
  await page.locator(".cu-task-row").first().hover();
  await rowButton(page, "86c1aaaaa").click();
  await expect(rowButton(page, "86c1aaaaa")).toHaveAttribute("data-state", "running");
  expect(fake.running).toMatchObject({
    description: "Fix login redirect loop | #86c1aaaaa",
    project_id: "proj-domain",
  });
});

test("auto-match can be switched off", async ({ configure, context, extensionId, clickup, fake }) => {
  await configure({ mapping: false });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("Match projects automatically by name").uncheck();
  await options.getByRole("button", { name: "Save" }).click();
  await options.getByText("Saved.").waitFor();

  const page = await clickup("/t/86c1aaaaa");
  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "running");
  expect(fake.running).toMatchObject({ project_id: null });
});

test.describe("real ClickUp 4 layouts", () => {
  test("list view: a List named after the domain picks that project", async ({ configure, clickup, fake }) => {
    await configure({ mapping: false });
    const page = await clickup("/9012345/v/l/6-900000000001-1");
    const button = rowButton(page, "86c1eeee1");
    await expect(button.getByRole("button")).toHaveAttribute("title", /List: northwind\.de \(Northwind Planung GmbH\)/);
    await page.locator(".cu-task-row").first().hover();
    await button.click();
    await expect(button).toHaveAttribute("data-state", "running");
    expect(fake.running).toMatchObject({ description: "Update Impressum | #86c1eeee1", project_id: "proj-northwind" });
  });

  test("task view: compact header breadcrumbs pick the project", async ({ configure, clickup, fake }) => {
    await configure({ mapping: false });
    const page = await clickup("/t/9012345/86c1eeee1");
    await detailButton(page).click();
    await expect(detailButton(page)).toHaveAttribute("data-state", "running");
    expect(fake.running).toMatchObject({ description: "Update Impressum | #86c1eeee1", project_id: "proj-northwind" });
  });
});

test("says so when auto-match finds no project", async ({ configure, clickup, fake }) => {
  await configure({ mapping: false });
  const page = await clickup("/");
  await page.evaluate(() => {
    document.querySelector('[data-test^="list-group-name"]')!.textContent = "Internal";
    document.querySelector(".cu-list-group__header-breadcrumbs")!.textContent = "Ops / Misc";
  });
  await page.locator(".cu-task-row").first().hover();
  await rowButton(page, "86c1aaaaa").click();
  await expect(page.getByRole("alert")).toContainText('no Solidtime project name appears in the List "Internal"');
  expect(fake.running).toMatchObject({ project_id: null });
});

test("open Solidtime tabs refresh the timer and the entry list after start and stop", async ({
  configure,
  context,
  clickup,
  fake,
}) => {
  await configure({ mapping: false });
  const solidtime = await context.newPage();
  await solidtime.goto(`${fake.url}/app`);
  const refreshes = solidtime.locator("#refreshes");
  const invalidated = solidtime.locator("#invalidated");
  const before = Number(await refreshes.textContent());

  const page = await clickup("/t/86c1aaaaa");
  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "running");
  await expect.poll(async () => Number(await refreshes.textContent())).toBeGreaterThan(before);
  await expect(invalidated).toHaveText('["timeEntries"];');

  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "idle");
  await expect(invalidated).toHaveText('["timeEntries"];["timeEntries"];');
});

test("custom task ids: the row stops the timer started in the task view instead of duplicating it", async ({
  configure,
  clickup,
  fake,
}) => {
  await configure({ mapping: false });
  const page = await clickup("/t/86c1aaaaa");
  // Workspace with custom ids: the task view shows WEB-7, the row links to the native id.
  await page.evaluate(() => (document.querySelector(".cu-task-id-button__label")!.textContent = "WEB-7"));
  await expect(detailButton(page)).toHaveAttribute("data-task-id", "WEB-7");

  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "running");
  expect(fake.running?.description).toBe("Fix login redirect loop | #WEB-7");
  await expect(rowButton(page, "86c1aaaaa")).toHaveAttribute("data-state", "running");

  await page.locator(".cu-task-row").first().hover();
  await rowButton(page, "86c1aaaaa").click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "idle");
  expect(fake.running).toBeUndefined();
  expect(fake.entries).toHaveLength(1);
});

test("options flag mappings whose project was deleted, and clear them on save", async ({
  configure,
  context,
  extensionId,
  background,
}) => {
  await configure();
  await background.evaluate(async () => {
    const { settings } = (await chrome.storage.local.get("settings")) as {
      settings: { mapping: Record<string, unknown> };
    };
    settings.mapping = { ...settings.mapping, spaces: { Ops: "deleted-project" } };
    await chrome.storage.local.set({ settings });
  });
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByText(/1 setting\(s\) point to a Solidtime project that no longer exists/)).toBeVisible();
  await expect(options.locator("option", { hasText: "Project no longer exists" })).toHaveCount(1);

  await options.getByRole("button", { name: "Save" }).click();
  await expect(options.getByText("Saved. Cleared 1 setting(s) that pointed to deleted projects.")).toBeVisible();
  const spaces = await background.evaluate(
    async () =>
      ((await chrome.storage.local.get("settings")) as { settings: { mapping: { spaces: object } } }).settings.mapping
        .spaces,
  );
  expect(spaces).toEqual({});
});

test("a timer stopped in Solidtime shows as stopped in a visible ClickUp tab without clicking", async ({
  configure,
  clickup,
  fake,
}) => {
  test.slow(); // waits for one 10 s poll
  await configure({ mapping: false });
  const page = await clickup("/t/86c1aaaaa");
  await detailButton(page).click();
  await expect(detailButton(page)).toHaveAttribute("data-state", "running");

  await fetch(`${fake.url}/__test/stop-running`, { method: "POST" });
  await expect(detailButton(page)).toHaveAttribute("data-state", "idle", { timeout: 15_000 });
});
