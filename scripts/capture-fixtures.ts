/**
 * Saves real ClickUp pages as test fixtures, so DOM tests can tell you when a
 * ClickUp UI update breaks a selector.
 *
 *   npm run capture-fixtures
 *
 * A browser opens with a dedicated profile (.auth/clickup-profile, git-ignored).
 * Log in once, then follow the prompts in this terminal. Scripts, styles and
 * inline data are stripped; review the files before sharing them anywhere, as
 * they contain your task names.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const ROOT = join(import.meta.dirname, "..");
const PROFILE = join(ROOT, ".auth", "clickup-profile");
const OUT = join(ROOT, "tests", "fixtures", "captured");

async function snapshot(page: Page): Promise<string> {
  return page.evaluate(() => {
    const doc = document.documentElement.cloneNode(true) as HTMLElement;
    doc
      .querySelectorAll("script, style, link, iframe, svg, img, video, noscript, [data-solidtime-bridge]")
      .forEach((el) => el.remove());
    for (const el of Array.from(doc.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === "style" || attr.name.startsWith("on") || attr.name === "src" || attr.name === "srcset") {
          el.removeAttribute(attr.name);
        }
      }
    }
    return `<!doctype html>\n<!-- captured from ${location.pathname} on ${new Date().toISOString()} -->\n${doc.outerHTML}`;
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE, { headless: false, viewport: null });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://app.clickup.com");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const steps = [
    ["task-modal", "Open a task as a modal over a List view"],
    ["task-page", "Open a task in full-page view"],
    ["list-view", "Open a List view with several tasks visible"],
  ] as const;

  for (const [name, instruction] of steps) {
    const answer = await rl.question(`\n${instruction}, then press Enter (or type "s" to skip): `);
    if (answer.trim().toLowerCase() === "s") continue;
    const file = join(OUT, `${name}.html`);
    writeFileSync(file, await snapshot(page));
    console.log(`Saved ${file}  (url: ${page.url()})`);
  }

  rl.close();
  await context.close();
  console.log("\nNow run: npm test   (tests/dom/captured.test.ts checks these files)");
}

void main();
