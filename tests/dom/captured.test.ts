// @vitest-environment happy-dom
/**
 * Runs the ClickUp readers against real pages saved by `npm run capture-fixtures`.
 * Skipped when nothing has been captured (e.g. in CI).
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findDetailAnchor, findRows, readDetailTask, readRowTask } from "../../src/clickup/read";
import { fixtureHtml, loadFixture } from "../support/loadFixture";

const dir = join(import.meta.dirname, "..", "fixtures", "captured");
const files = readdirSync(dir).filter((f) => f.endsWith(".html"));
const capturedPath = (file: string) => fixtureHtml(`captured/${file}`).match(/captured from (\S+)/)?.[1] ?? "/";

describe.skipIf(files.length === 0)("captured ClickUp pages", () => {
  for (const file of files.filter((f) => f.startsWith("task-"))) {
    it(`${file}: finds the header anchor and reads the open task`, () => {
      loadFixture(`captured/${file}`, `https://app.clickup.com${capturedPath(file)}`);
      expect(findDetailAnchor(), "detailAnchor selector").not.toBeNull();
      const task = readDetailTask();
      expect(task?.id, "task id").toMatch(/^[A-Za-z0-9_-]+$/);
      expect(task?.title, "task title").toBeTruthy();
      expect(task?.location?.space, "breadcrumb space").toBeTruthy();
    });
  }

  for (const file of files.filter((f) => f.startsWith("list-"))) {
    it(`${file}: reads the list rows`, () => {
      loadFixture(`captured/${file}`, `https://app.clickup.com${capturedPath(file)}`);
      const rows = findRows();
      expect(rows.length, "row selector").toBeGreaterThan(0);
      const tasks = rows.map(readRowTask).filter(Boolean);
      expect(tasks.length, "rows with id + title").toBeGreaterThan(0);
      expect(tasks[0]?.location?.list, "list group name").toBeTruthy();
    });
  }
});
