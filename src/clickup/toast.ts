const TOAST_ID = "solidtime-bridge-toast";
const STYLE = `
  div { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; max-width: 360px;
    padding: 12px 14px; border-radius: 8px; background: #1f2937; color: #fff;
    font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 8px 24px rgb(0 0 0 / .25); cursor: pointer; }
  strong { display: block; margin-bottom: 2px; }
`;

/** Small, dismissable error message in the bottom-right corner. */
export function showToast(doc: Document, message: string, timeoutMs = 6000): void {
  doc.getElementById(TOAST_ID)?.remove();
  const host = doc.createElement("div");
  host.id = TOAST_ID;
  host.setAttribute("role", "alert");
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = STYLE;
  const box = doc.createElement("div");
  const heading = doc.createElement("strong");
  heading.textContent = "Solidtime";
  const text = doc.createElement("span");
  // Messages may come from the Solidtime server: plain text only, bounded length.
  text.textContent = message.length > 300 ? `${message.slice(0, 299)}…` : message;
  box.append(heading, text);
  shadow.append(style, box);
  host.addEventListener("click", () => host.remove());
  doc.body.appendChild(host);
  setTimeout(() => host.remove(), timeoutMs);
}
