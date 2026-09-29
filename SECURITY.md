# Security

## Reporting a vulnerability

Please report security issues privately via GitHub's
[private vulnerability reporting](../../security/advisories/new) rather than a public issue.

## Security model

This describes how the extension is designed to protect your data. It is not a guarantee; the software is provided without warranty (see the [Disclaimer](README.md#disclaimer)).

| Concern                    | How it's handled                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API token storage**      | Stored in `browser.storage.local`. In Chromium the background sets the storage access level to trusted contexts, so content scripts (and therefore a compromised ClickUp tab) cannot read it. Firefox has no equivalent API; there the token is readable by the extension's own content script, but never by ClickUp's page JavaScript.                                                                                     |
| **Token in transit**       | HTTPS is required (plain HTTP only for the loopback addresses `localhost`, `127.0.0.1` and `[::1]`). Requests never follow redirects, send no cookies (`credentials: "omit"`) and go only to the configured origin.                                                                                                                                                                                                         |
| **Permissions**            | `storage` and `scripting`. Host access to the Solidtime URL is requested at runtime for that one origin. `scripting` is used only on that origin: after a start/stop, a fixed function runs in open Solidtime tabs and does what Solidtime's own UI does after a stop (fires `focus`, invalidates the `timeEntries` query cache) so the page refreshes. It sends nothing back to the extension and injects no page content. |
| **Untrusted page content** | Task titles, ids and names come from ClickUp's DOM, which any workspace member can author. They are never inserted as HTML: the UI is built with DOM APIs (`textContent`, no `innerHTML`). The background re-validates every message (task id format, length limits, control/bidi characters stripped).                                                                                                                     |
| **Messaging**              | The background only accepts messages from its own content scripts on `https://app.clickup.com` and its own extension pages. There is no `externally_connectable` and there are no web-accessible resources.                                                                                                                                                                                                                 |
| **Spoofed clicks**         | Buttons only react to genuine user input (`event.isTrusted`), so page scripts cannot start or stop timers.                                                                                                                                                                                                                                                                                                                  |
| **Races**                  | Toggles are serialised in the background, so clicks in several tabs cannot create two running entries.                                                                                                                                                                                                                                                                                                                      |
| **Supply chain**           | No runtime dependencies (the bundle is our code plus WXT's tiny `browser` shim). GitHub Actions are pinned to commit SHAs, workflows default to read-only permissions, `npm audit` runs in CI, and Dependabot updates both.                                                                                                                                                                                                 |

## What the extension sends where

- **To your Solidtime instance:** the API token (as a bearer header), the task title and id, and the chosen project, organization and member ids.
- **To anyone else:** nothing. There is no analytics or telemetry, and no third-party requests.
