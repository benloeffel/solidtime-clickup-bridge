/**
 * Loads the extension into the logged-in profile created by `npm run capture-fixtures`
 * and checks that the buttons appear on the real ClickUp. It does not create time entries.
 *
 *   LIVE_TASK_URL=https://app.clickup.com/t/86c1abcde LIVE_LIST_URL=https://app.clickup.com/.../v/li/... npm run test:live
 */
import { chromium, expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const PROFILE = join(ROOT, ".auth", "clickup-profile");
const EXTENSION = join(ROOT, ".output-e2e", "chrome-mv3");

test.skip(!existsSync(PROFILE), "Run `npm run capture-fixtures` once to create a logged-in profile.");

test("buttons appear on real ClickUp pages", async () => {
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: "chromium",
    headless: false,
    args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
  });
  const page = context.pages()[0] ?? (await context.newPage());

  if (process.env.LIVE_TASK_URL) {
    await page.goto(process.env.LIVE_TASK_URL);
    const detail = page.locator('[data-solidtime-bridge="detail"]');
    await expect(detail, "detail button (check SELECTORS.detailAnchor / detailTitle)").toHaveCount(1, {
      timeout: 30_000,
    });
    console.log("Detail task id:", await detail.getAttribute("data-task-id"));
  }

  if (process.env.LIVE_LIST_URL) {
    await page.goto(process.env.LIVE_LIST_URL);
    const rows = page.locator('[data-solidtime-bridge="row"]');
    await expect(rows.first(), "row buttons (check SELECTORS.row / rowLink)").toBeAttached({ timeout: 30_000 });
    console.log("Row buttons:", await rows.count());
  }

  await context.close();
});
