export type ButtonVariant = "detail" | "row";
export type ButtonState = "idle" | "running" | "busy";

export const HOST_ATTR = "data-solidtime-bridge";

const SVG_NS = "http://www.w3.org/2000/svg";
const PLAY_PATH = "M5 3.5v9a.75.75 0 0 0 1.14.64l7.2-4.5a.75.75 0 0 0 0-1.28l-7.2-4.5A.75.75 0 0 0 5 3.5z";
const STOP_PATH = "M5 3.5h6A1.5 1.5 0 0 1 12.5 5v6a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 11V5A1.5 1.5 0 0 1 5 3.5z";

function icon(doc: Document, running: boolean): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", running ? STOP_PATH : PLAY_PATH);
  svg.appendChild(path);
  return svg;
}

const STYLE = `
  :host { display: inline-flex; align-items: center; vertical-align: middle; }
  button {
    all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px;
    cursor: pointer; border-radius: 6px; font: 500 13px/1 system-ui, sans-serif;
    color: #fff; background: #6b7280; transition: background .15s, opacity .15s;
  }
  button:focus-visible { outline: 2px solid #7b68ee; outline-offset: 2px; }
  button.detail { height: 28px; padding: 0 10px; }
  button.row { width: 22px; height: 22px; justify-content: center; border-radius: 50%; }
  button[data-state="idle"] { background: #4f46e5; }
  button[data-state="idle"]:hover { background: #4338ca; }
  button[data-state="running"] { background: #dc2626; }
  button[data-state="running"]:hover { background: #b91c1c; }
  button[data-state="busy"] { opacity: .6; cursor: progress; }
  svg { width: 14px; height: 14px; fill: currentColor; flex-shrink: 0; }
`;

/** Creates an isolated (Shadow DOM) timer button so ClickUp's CSS can't affect it. */
export function createButtonHost(doc: Document, variant: ButtonVariant): HTMLElement {
  const host = doc.createElement("span");
  host.setAttribute(HOST_ATTR, variant);
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = STYLE;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = variant;
  shadow.append(style, button);
  renderButtonState(host, "idle");
  return host;
}

export function getButtonState(host: HTMLElement): ButtonState | null {
  return (host.getAttribute("data-state") as ButtonState | null) ?? null;
}

export function renderButtonState(host: HTMLElement, state: ButtonState): void {
  if (host.getAttribute("data-state") === state) return;
  host.setAttribute("data-state", state);
  const button = host.shadowRoot?.querySelector("button");
  if (!button) return;
  const variant = host.getAttribute(HOST_ATTR) as ButtonVariant;
  const running = state === "running";
  const label = state === "busy" ? "Working…" : running ? "Stop timer" : "Start timer";
  button.dataset.state = state;
  button.disabled = state === "busy";
  button.setAttribute("aria-label", `${label} in Solidtime`);
  renderTooltip(host);
  const doc = host.ownerDocument;
  const content: Node[] = [icon(doc, running)];
  if (variant === "detail") {
    const text = doc.createElement("span");
    text.textContent = label;
    content.push(text);
  }
  button.replaceChildren(...content);
}

/**
 * Tooltip = action + the ClickUp List the task was read from, so users can see
 * which name project matching will use (e.g. "Start timer in Solidtime · List: acme.com").
 */
export function setButtonContext(host: HTMLElement, list: string | null | undefined): void {
  const context = list ? `List: ${list}` : "";
  if ((host.dataset.context ?? "") === context) return;
  host.dataset.context = context;
  renderTooltip(host);
}

function renderTooltip(host: HTMLElement): void {
  const button = host.shadowRoot?.querySelector("button");
  if (!button) return;
  const action = button.getAttribute("aria-label") ?? "";
  button.title = host.dataset.context ? `${action} · ${host.dataset.context}` : action;
}
