import { browser } from "wxt/browser";
import type { State, StateMessage } from "../messages";

const TABS_KEY = "clickupTabs";

/**
 * Holds the current State and pushes it to every ClickUp tab that has asked for it.
 * Tab ids live in storage.session, so pushes still reach all tabs after the browser
 * restarts the service worker (content scripts have no storage access).
 */
export function createStateHub() {
  let state: State = { configured: false, activeTaskIds: [] };

  async function tabIds(): Promise<number[]> {
    return (((await browser.storage.session.get(TABS_KEY))[TABS_KEY] as number[] | undefined) ?? []).slice();
  }

  return {
    current: () => state,

    async registerTab(tabId: number | undefined): Promise<void> {
      if (tabId === undefined) return;
      const ids = await tabIds();
      if (!ids.includes(tabId)) await browser.storage.session.set({ [TABS_KEY]: [...ids, tabId] });
    },

    async publish(next: State): Promise<State> {
      state = next;
      const message: StateMessage = { type: "state", state };
      const ids = await tabIds();
      const alive = await Promise.all(
        ids.map((id) =>
          browser.tabs.sendMessage(id, message).then(
            () => true,
            () => false, // tab closed or navigated away from ClickUp
          ),
        ),
      );
      const remaining = ids.filter((_, i) => alive[i]);
      if (remaining.length !== ids.length) await browser.storage.session.set({ [TABS_KEY]: remaining });
      return state;
    },
  };
}
