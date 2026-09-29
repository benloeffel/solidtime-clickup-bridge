# Solidtime for ClickUp

A small browser extension that adds a **Start / Stop timer** button to ClickUp tasks and tracks the time in [Solidtime](https://www.solidtime.io), including self-hosted instances.

Entries are named the way Clockify's ClickUp integration named them:

```
Title of an awesome task | #86c1abcde
```

- **Task view** (modal, side panel or full page): the button sits in the task header.
- **List view**: a play button shows on each row when you hover over it.
- **One click switches tasks.** If another timer is running (including one started in the Solidtime desktop app or web UI), it is stopped and the new one starts. Clicking the task that is already being tracked stops it.
- **Projects are picked automatically:** if a Solidtime project's name appears in the ClickUp List name (or the Space name), that project is used. Manual List/Space mappings and a default project are available when names don't line up (see [Projects](#projects)).
- Custom task IDs (e.g. `#DEV-42`) are used when your workspace has them enabled.

The extension has no runtime dependencies, and the built extension is about 30 kB. It has no analytics. It talks only to ClickUp (to read the page) and to the Solidtime URL you configure. See [SECURITY.md](SECURITY.md) for the security model: how the token is protected, which permissions it uses, and what is sent where.

## Install

### From a release

1. Download the latest `*-chrome.zip` or `*-firefox.zip` from [Releases](../../releases) and unzip it.
2. **Chrome / Edge / Brave:** open `chrome://extensions`, enable _Developer mode_, then click _Load unpacked_ and select the unzipped folder.
   **Firefox:** open `about:debugging#/runtime/this-firefox`, click _Load Temporary Add-on…_ and select `manifest.json`. A temporary add-on is removed when Firefox restarts until the extension is signed on addons.mozilla.org. Firefox may also ask you to allow the extension on `app.clickup.com` (Extensions → Solidtime for ClickUp → Permissions).

   > **Firefox and the API token:** Chrome, Edge and Brave let the extension lock the stored token away from its own ClickUp script, so even a compromised ClickUp tab can't read it. Firefox has no such setting: there, the extension's ClickUp script could technically read the token. ClickUp's own page scripts still can't. See [SECURITY.md](SECURITY.md).

### From source

```bash
npm install
npm run build            # → .output/chrome-mv3
npm run build:firefox    # → .output/firefox-mv3
```

## Setup

1. **Self-hosted only: enable API tokens once.** Out of the box, a self-hosted Solidtime can't create API tokens: _Create API Token_ fails until an admin creates a "personal access" client on the server. In your Solidtime directory run:
   ```bash
   sudo docker compose exec scheduler php artisan passport:client --personal --name="API"
   ```
   It asks _"Which user provider should this client use to retrieve users? [users]"_. Press **Enter** to accept `users`. This only needs to be done once per instance ([Solidtime docs](https://docs.solidtime.io/self-hosting/guides/docker#11-activate-api-access-via-user-api-tokens-optional)). Users of the hosted app.solidtime.io can skip this step.
2. **Create an API token** in Solidtime: _Profile Settings → Create API Token_. Copy it; it is only shown once.
3. Open the extension options (right-click the extension icon → _Options_). Enter your Solidtime URL (it must be `https://`) and the token, then click **Connect**. Your browser asks for permission to reach that URL; this is the only site the extension gets access to besides `app.clickup.com`.
4. Pick your organization. Choose how projects are assigned (see below), then click **Save**.
5. Open a ClickUp task and click **Start timer**.

## Projects

The project for a new entry is chosen in this order, and the first match wins:

1. A **manual List mapping** (options page)
2. A **manual Space mapping**
3. **Automatic match on the List name:** the Solidtime project whose name appears in the ClickUp List name
4. **Automatic match on the Space name**
5. The **default project**, or no project

Automatic matching is on by default and ignores case. It matches whole words and whole domains only:

| ClickUp List            | Solidtime projects  | Result                          |
| ----------------------- | ------------------- | ------------------------------- |
| `example.com – Website` | `example.com`       | `example.com`                   |
| `Support for Acme`      | `Acme`, `Acme Corp` | `Acme`                          |
| `Acme Corp retainer`    | `Acme`, `Acme Corp` | `Acme Corp` (longest name wins) |
| `shop.example.com`      | `example.com`       | no match (different domain)     |
| `Happy path tests`      | `App`               | no match (not a whole word)     |

If two different projects of the same length both match, no project is guessed; the next rule applies instead.

## Staying in sync with Solidtime

- **Solidtime tabs update right away.** Solidtime's web app has no live updates. After every start/stop, the extension does in your open Solidtime tabs (same browser) what Solidtime itself does after a stop: it reloads the running timer and the time-entry list. If a future Solidtime version changes its internals, only the list refresh stops working; the timer still updates.
- **ClickUp buttons follow changes made elsewhere.** A timer started or stopped in Solidtime's web app, the desktop app or the API shows up in ClickUp when you switch to the tab, or within 10 seconds while the tab is visible. All ClickUp tabs share one check, so this stays far below Solidtime's API rate limit.

## How it works

```
src/core/        Pure logic, unit-tested: description format, task ids, project
                 resolution, start/stop/switch decision, a small Solidtime REST client
src/clickup/     Everything that knows about ClickUp's DOM. selectors.ts is the only
                 file that should need changes when ClickUp updates its UI
src/background/  Background helpers: pushes "what is running" to every ClickUp tab,
                 remembers all ids of the tracked task, caches projects, refreshes
                 open Solidtime tabs
entrypoints/
  background.ts       Makes every Solidtime API call; wires the helpers together
  clickup.content.ts  Injects the buttons (Shadow DOM, so styles never clash)
  options/            Settings page
```

Solidtime API used: `GET /users/me/memberships`, `GET /users/me/time-entries/active`, `POST /organizations/{org}/time-entries`, `PUT /organizations/{org}/time-entries/{id}`, `GET /organizations/{org}/projects`.

## Development

```bash
npm run dev            # Chrome with hot reload
npm run dev:firefox
npm test               # Vitest: unit + DOM tests (happy-dom)
npm run test:e2e       # Playwright: real Chromium + built extension + fake Solidtime server
npm run typecheck
npm run lint           # ESLint + Prettier check (npm run format to fix)
npm run check-manifest # after a build: fails if permissions grow
```

### Tests

| Layer        | What it covers                                                                                                                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit` | Description format and parsing, project resolution order, the Solidtime client and start/stop/switch logic. These run against an in-memory fake Solidtime (`tests/support/fakeSolidtime.ts`) that enforces the real API rules: one running entry per member, the `Y-m-d\TH:i:sZ` date format and 404 when nothing is running. |
| `tests/dom`  | ClickUp DOM readers and button injection, run against saved ClickUp pages: idempotent injection, SPA task switches, virtual-scroll rows, clicks not reaching the row link.                                                                                                                                                    |
| `tests/e2e`  | The built extension loaded in Chromium. ClickUp URLs are served from fixtures and Solidtime is the fake server. Covers setup through the options page, start, stop, switch, stopping timers started elsewhere, the multi-tab state, toasts for API errors, and the not-configured flow.                                       |

### When ClickUp changes its UI

ClickUp updates its markup regularly. The fixtures under `tests/fixtures/synthetic` are hand-written from ClickUp's current markup. To check against your real workspace:

```bash
npm run capture-fixtures   # opens a browser: log in once, follow the prompts
npm test                   # tests/dom/captured.test.ts now runs on those pages
```

If a test fails, update `src/clickup/selectors.ts`. Every selector has fallbacks and the first match wins. Captured pages are git-ignored because they contain your task names.

For a quick smoke test on the live site, which does not create any time entries:

```bash
LIVE_TASK_URL=https://app.clickup.com/t/<id> LIVE_LIST_URL=<list view url> npm run test:live
```

### Releasing

Push a `v*` tag. CI runs the tests and attaches the Chrome and Firefox zips to a GitHub release.

## Relationship to the official Solidtime extension

The [official Solidtime browser extension](https://github.com/solidtime-io/browser-extension) adds timers to Linear, Jira and Plane, but not ClickUp. This project is standalone so that it can ship on its own schedule. The ClickUp code is kept in one self-contained folder (`src/clickup/`) so it could be contributed upstream later ([related request](https://github.com/solidtime-io/browser-extension/issues/3)).

## Disclaimer

- **Unofficial.** This is an independent community project. It is not affiliated with, endorsed by or supported by Solidtime or ClickUp. "Solidtime" and "ClickUp" are trademarks of their respective owners and are used here only to describe what the extension works with.
- **No warranty, use at your own risk.** The software is provided "as is", without warranty of any kind (see [LICENSE](LICENSE)). The authors and contributors are not liable for any claim, damages or other liability arising from its use. That includes missing, incorrect or duplicated time entries, billing or invoicing errors, data loss, account or API-token misuse, or service interruptions.
- **You stay responsible for your data.** Check your tracked time before using it for billing, keep your API token private, and revoke it in Solidtime if you stop using the extension.
- **Third-party changes.** ClickUp and Solidtime can change their apps at any time, which may stop the extension from working until it is updated.

## License

[MIT](LICENSE). No warranty; see the [Disclaimer](#disclaimer).
