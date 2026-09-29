import { browser } from "wxt/browser";
import { originPattern } from "../settings";

/**
 * Runs inside open Solidtime tabs (page context). Solidtime's web app has no live
 * updates, so do what it does itself after a start/stop:
 * - its window "focus" handler re-fetches the running timer (top bar);
 * - invalidating the ['timeEntries'] queries reloads the entry list (rows), which
 *   otherwise stays cached for 30 s. Uses Vue's app handle and vue-query's default
 *   client key; if a Solidtime update changes either, only the list refresh is lost.
 * Self-contained on purpose: executeScript serialises this function.
 */
export function refreshSolidtimePage(): void {
  window.dispatchEvent(new Event("focus"));
  try {
    type QueryClient = { invalidateQueries(filters: { queryKey: unknown[] }): unknown };
    const root = document.querySelector("#app") as
      (Element & { __vue_app__?: { _context?: { provides?: Record<string, unknown> } } }) | null;
    const client = root?.__vue_app__?._context?.provides?.["VUE_QUERY_CLIENT"] as QueryClient | undefined;
    if (typeof client?.invalidateQueries === "function") void client.invalidateQueries({ queryKey: ["timeEntries"] });
  } catch {
    // Unknown Solidtime version: the focus refresh above still updates the timer.
  }
}

/** Refreshes every open tab of the user's Solidtime instance. Only on the granted origin; best-effort. */
export async function refreshSolidtimeTabs(baseUrl: string): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ url: originPattern(baseUrl) });
    await Promise.all(
      tabs.map((tab) =>
        tab.id === undefined
          ? undefined
          : browser.scripting
              // MAIN world: the Vue app handle is a page-side property, invisible to isolated scripts.
              .executeScript({ target: { tabId: tab.id }, world: "MAIN", func: refreshSolidtimePage })
              .catch(() => undefined),
      ),
    );
  } catch {
    // Best-effort.
  }
}
