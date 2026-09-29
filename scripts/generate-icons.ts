/** Renders public/icon.svg to the PNG sizes browsers need. Run after editing the SVG. */
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const svg = readFileSync(join(ROOT, "public", "icon.svg"), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 96, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: join(ROOT, "public", "icon", `${size}.png`), omitBackground: true });
}
await browser.close();
