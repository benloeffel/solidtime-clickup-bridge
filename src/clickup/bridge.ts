import { sharesTaskId } from "../core/taskId";
import { taskIds, type ClickUpTask } from "../core/timerToggle";
import {
  createButtonHost,
  getButtonState,
  HOST_ATTR,
  renderButtonState,
  setButtonContext,
  type ButtonVariant,
} from "./button";
import { findDetailAnchor, findRows, readDetailTask, readRowTask } from "./read";
import { queryFirst, SELECTORS } from "./selectors";

export interface Bridge {
  /** Adds/updates/removes buttons to match the current page. Idempotent. */
  sync(): void;
  /** All ClickUp ids of the task whose timer is running (empty when none). */
  setActiveTaskIds(ids: readonly string[]): void;
  disconnect(): void;
}

export type ToggleHandler = (task: ClickUpTask) => Promise<void>;

export interface BridgeOptions {
  /**
   * Ignore clicks that did not come from the user (e.g. page scripts calling
   * button.click()). Only disabled in DOM unit tests, where every event is synthetic.
   */
  requireTrustedClicks?: boolean;
}

const ROW_STYLE_ID = "solidtime-bridge-style";
const ROW_STYLE = `
  ${SELECTORS.rowHover} [${HOST_ATTR}="row"] { margin: 0 4px; opacity: 0; transition: opacity .1s; }
  ${SELECTORS.rowHover}:hover [${HOST_ATTR}="row"],
  [${HOST_ATTR}="row"][data-state="running"],
  [${HOST_ATTR}="row"]:focus-within { opacity: 1; }
  [${HOST_ATTR}="detail"] { margin-left: 12px; }
`;

export function createBridge(doc: Document, onToggle: ToggleHandler, options: BridgeOptions = {}): Bridge {
  const requireTrusted = options.requireTrustedClicks ?? true;
  /** Last task seen for each button, plus how to re-read it from the page at click time. */
  const tasks = new WeakMap<HTMLElement, { task: ClickUpTask; read: () => ClickUpTask | null }>();
  let activeTaskIds: readonly string[] = [];
  let busyTask: ClickUpTask | null = null;
  let scheduled: ReturnType<typeof setTimeout> | null = null;

  function stateFor(task: ClickUpTask) {
    if (busyTask && sharesTaskId(taskIds(task), taskIds(busyTask))) return "busy" as const;
    return sharesTaskId(taskIds(task), activeTaskIds) ? ("running" as const) : ("idle" as const);
  }

  function attach(host: HTMLElement, task: ClickUpTask, read: () => ClickUpTask | null) {
    tasks.set(host, { task, read });
    host.setAttribute("data-task-id", task.id);
    renderButtonState(host, stateFor(task));
    setButtonContext(host, task.location?.list);
  }

  function newHost(variant: ButtonVariant) {
    const host = createButtonHost(doc, variant);
    // Rows are links and drag handles: keep ClickUp from opening/dragging the task.
    for (const type of ["pointerdown", "mousedown"]) host.addEventListener(type, (event) => event.stopPropagation());
    host.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (requireTrusted && !event.isTrusted) return;
      // Re-read so a click right after a ClickUp re-render never uses stale names.
      const entry = tasks.get(host);
      const task = entry ? (entry.read() ?? entry.task) : undefined;
      if (task && getButtonState(host) !== "busy") void run(task);
    });
    return host;
  }

  async function run(task: ClickUpTask) {
    // One toggle at a time; a second click elsewhere would race the first.
    if (busyTask) return;
    busyTask = task;
    sync();
    try {
      await onToggle(task);
    } finally {
      busyTask = null;
      sync();
    }
  }

  function ensureStyle() {
    if (doc.getElementById(ROW_STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = ROW_STYLE_ID;
    style.textContent = ROW_STYLE;
    (doc.head ?? doc.documentElement).appendChild(style);
  }

  function syncDetail() {
    const anchor = findDetailAnchor(doc);
    const task = anchor ? readDetailTask(doc) : null;
    const existing = Array.from(doc.querySelectorAll<HTMLElement>(`[${HOST_ATTR}="detail"]`));
    for (const host of existing) {
      if (!task || host.parentElement !== anchor) host.remove();
    }
    if (!anchor || !task) return;
    const host =
      anchor.querySelector<HTMLElement>(`:scope > [${HOST_ATTR}="detail"]`) ?? anchor.appendChild(newHost("detail"));
    attach(host, task, () => readDetailTask(doc));
  }

  function syncRows() {
    for (const row of findRows(doc)) {
      const task = readRowTask(row);
      let host = row.querySelector<HTMLElement>(`[${HOST_ATTR}="row"]`);
      if (!task) {
        host?.remove();
        continue;
      }
      if (!host) {
        host = newHost("row");
        const before = queryFirst(row, SELECTORS.rowAnchor);
        if (before?.parentElement) before.parentElement.insertBefore(host, before);
        else row.appendChild(host);
      }
      attach(host, task, () => readRowTask(row));
    }
  }

  function sync() {
    if (scheduled) {
      clearTimeout(scheduled);
      scheduled = null;
    }
    ensureStyle();
    syncDetail();
    syncRows();
  }

  // ClickUp is a SPA that re-renders constantly; batch mutations into one sync.
  const observer = new MutationObserver(() => {
    if (!scheduled) scheduled = setTimeout(sync, 150);
  });
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });

  return {
    sync,
    setActiveTaskIds(ids) {
      activeTaskIds = ids;
      sync();
    },
    disconnect() {
      observer.disconnect();
      if (scheduled) clearTimeout(scheduled);
    },
  };
}
