import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

export function fixtureHtml(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

/** Loads a fixture into the happy-dom document at the given ClickUp URL. */
export function loadFixture(name: string, url = "https://app.clickup.com/9012345/v/li/901"): void {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
  const parsed = new DOMParser().parseFromString(fixtureHtml(name), "text/html");
  document.title = parsed.title;
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;
  document.body.className = parsed.body.className;
}
