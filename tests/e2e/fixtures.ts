import { chromium, test as base, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { join } from "node:path";
import { fixtureHtml } from "../support/loadFixture";
import { FAKE_TOKEN, FakeSolidtime } from "../support/fakeSolidtime";

const EXTENSION_PATH = join(import.meta.dirname, "..", "..", ".output-e2e", "chrome-mv3");

/** Serves a synthetic fixture for any app.clickup.com URL, picked by path. */
function fixtureFor(url: URL): string {
  if (url.pathname === "/t/86c1aaaaa") return "synthetic/list-with-task-modal.html";
  if (url.pathname === "/t/9012345/86c1eeee1") return "synthetic/task-page-clickup4.html";
  if (url.pathname.startsWith("/9012345/v/l/")) return "synthetic/list-view-single-list.html";
  if (url.pathname.startsWith("/t/")) return "synthetic/task-page-custom-id.html";
  return "synthetic/list-only.html";
}

interface Fixtures {
  context: BrowserContext;
  extensionId: string;
  background: Worker;
  configure: (options?: { token?: string; mapping?: boolean }) => Promise<void>;
  clickup: (path?: string) => Promise<Page>;
}

export const test = base.extend<Fixtures, { fake: FakeSolidtime; fakeUrl: string }>({
  fake: [
    async ({}, use) => {
      const fake = new FakeSolidtime();
      await fake.listen();
      await use(fake);
      await fake.close();
    },
    { scope: "worker" },
  ],
  fakeUrl: [async ({ fake }, use) => use(fake.url), { scope: "worker" }],

  context: async ({ fake }, use) => {
    fake.reset();
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    await context.route("https://app.clickup.com/**", (route) => {
      const url = new URL(route.request().url());
      if (route.request().resourceType() !== "document") return route.fulfill({ status: 204 });
      return route.fulfill({ contentType: "text/html", body: fixtureHtml(fixtureFor(url)) });
    });
    await use(context);
    await context.close();
  },

  background: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },

  extensionId: async ({ background }, use) => {
    await use(new URL(background.url()).host);
  },

  configure: async ({ context, extensionId, fakeUrl }, use) => {
    await use(async ({ token = FAKE_TOKEN, mapping = true } = {}) => {
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/options.html`);
      await page.getByLabel("Solidtime URL").fill(fakeUrl);
      await page.getByLabel("API token").fill(token);
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      await page.getByText("Connected.").waitFor();
      if (mapping) {
        await page.getByLabel("Default project").selectOption({ label: "Engineering" });
        await page.getByRole("button", { name: "Add mapping" }).click();
        await page.getByLabel("ClickUp name").fill("Sprint Backlog");
        await page.getByLabel("Solidtime project").selectOption({ label: "Client Work" });
        await page.getByRole("button", { name: "Save" }).click();
        await page.getByText("Saved.").waitFor();
      }
      await page.close();
    });
  },

  clickup: async ({ context }, use) => {
    await use(async (path = "/t/86c1aaaaa") => {
      const page = await context.newPage();
      await page.goto(`https://app.clickup.com${path}`);
      return page;
    });
  },
});

export { expect } from "@playwright/test";
