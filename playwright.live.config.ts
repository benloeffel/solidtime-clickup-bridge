import { defineConfig } from "@playwright/test";

/** Opt-in smoke test against the real ClickUp (never run in CI). See tests/live/. */
export default defineConfig({
  testDir: "tests/live",
  workers: 1,
  timeout: 90_000,
  reporter: "list",
});
