/**
 * Guards release builds against permission creep (e.g. the E2E-only
 * 127.0.0.1 host permission leaking into a published zip). Run after `npm run build`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const failures: string[] = [];

for (const target of ["chrome-mv3", "firefox-mv3"]) {
  const manifest = JSON.parse(readFileSync(join(ROOT, ".output", target, "manifest.json"), "utf8"));
  const expect = (ok: boolean, message: string) => ok || failures.push(`${target}: ${message}`);

  expect(manifest.manifest_version === 3, "must be Manifest V3");
  expect(
    JSON.stringify(manifest.permissions) === '["storage","scripting"]',
    `permissions must be ["storage","scripting"], got ${JSON.stringify(manifest.permissions)}`,
  );
  expect(
    !manifest.host_permissions?.length,
    `no host_permissions allowed, got ${JSON.stringify(manifest.host_permissions)}`,
  );
  expect(
    JSON.stringify(manifest.optional_host_permissions) === '["https://*/*","http://*/*"]',
    "optional_host_permissions changed",
  );
  const matches = (manifest.content_scripts ?? []).flatMap((cs: { matches: string[] }) => cs.matches);
  expect(
    JSON.stringify(matches) === '["https://app.clickup.com/*"]',
    `content scripts may only match ClickUp, got ${JSON.stringify(matches)}`,
  );
  expect(!manifest.externally_connectable, "externally_connectable must not be set");
  expect(!manifest.web_accessible_resources?.length, "web_accessible_resources must be empty");
  expect(!manifest.content_security_policy, "keep the browser's default (strict) extension CSP");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Release manifests OK");
