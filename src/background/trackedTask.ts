import { browser } from "wxt/browser";
import type { TimeEntry } from "../core/solidtime";
import { uniqueTaskIds } from "../core/taskId";
import type { KnownTaskIds } from "../core/timerToggle";

const KEY = "trackedTask";

interface TrackedTask {
  entryId: string;
  taskIds: string[];
}

/**
 * Remembers every ClickUp id of the task we started (e.g. custom + native id), so a
 * row that only knows the native id still recognises the running entry. Kept in
 * storage.session: survives service-worker restarts, cleared with the browser session.
 */
export const trackedTask = {
  async remember(entry: TimeEntry, taskIds: readonly string[]): Promise<void> {
    const value: TrackedTask = { entryId: entry.id, taskIds: uniqueTaskIds(taskIds) };
    await browser.storage.session.set({ [KEY]: value });
  },

  /** Returns a lookup of the remembered ids for the given running entry. */
  async lookup(): Promise<KnownTaskIds> {
    const tracked = (await browser.storage.session.get(KEY))[KEY] as TrackedTask | undefined;
    return (entry) => (tracked && tracked.entryId === entry.id ? tracked.taskIds : []);
  },
};
