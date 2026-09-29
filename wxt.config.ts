import { defineConfig } from "wxt";

// E2E builds talk to a local fake Solidtime server; pre-granting it avoids the
// permission prompt Playwright can't click. Never set for release builds.
const e2e = process.env.E2E === "1";

export default defineConfig({
  srcDir: ".",
  outDir: e2e ? ".output-e2e" : ".output",
  manifest: {
    name: "Solidtime for ClickUp",
    description:
      "Unofficial: start Solidtime timers from ClickUp tasks with one click. Not affiliated with Solidtime or ClickUp.",
    // scripting: after start/stop, nudge open tabs of the user's own Solidtime instance to refresh
    // (only possible on the origin the user granted; see refreshSolidtimeTabs in background.ts).
    permissions: ["storage", "scripting"],
    // The Solidtime instance URL is user-configured, so access is requested at runtime.
    optional_host_permissions: ["https://*/*", "http://*/*"],
    host_permissions: e2e ? ["http://127.0.0.1/*"] : [],
    browser_specific_settings: {
      gecko: {
        id: "solidtime-clickup-bridge@benloeffel",
        // Task titles/ids and the API token are sent only to the user's own Solidtime instance.
        data_collection_permissions: { required: ["authenticationInfo", "websiteContent"] },
      },
    },
  },
});
