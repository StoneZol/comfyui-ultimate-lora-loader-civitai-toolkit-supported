import { CLOSE_ICON_SVG } from "./icons.js";

/**
 * Centered modal popup. `render(body, { close, reposition })` builds content.
 */
export function openPopup({
  title = "",
  width = 420,
  render,
  onClose,
  nested = false,
} = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "ullc-preset-backdrop" + (nested ? " nested" : "");

  const root = document.createElement("div");
  root.className = "ullc-preset-popup";
  root.style.width = `min(${width}px, 100%)`;

  const head = document.createElement("div");
  head.className = "ullc-preset-popup-head";

  const titleEl = document.createElement("div");
  titleEl.className = "ullc-preset-popup-title";
  titleEl.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ullc-preset-popup-close";
  closeBtn.innerHTML = CLOSE_ICON_SVG;
  closeBtn.title = "Close";

  head.append(titleEl, closeBtn);

  const body = document.createElement("div");
  body.className = "ullc-preset-popup-body";

  root.append(head, body);
  backdrop.appendChild(root);
  document.body.appendChild(backdrop);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
    onClose?.();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  const api = { close, reposition: () => {} };
  try {
    render?.(body, api);
  } catch (err) {
    console.error(err);
    const msg = document.createElement("div");
    msg.className = "ullc-preset-error";
    msg.textContent = String(err?.message || err);
    body.appendChild(msg);
  }

  return { close, root, body };
}

export function openConfirmPopup({
  title = "Confirm",
  message = "",
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  showCancel = true,
  danger = false,
  onConfirm,
  nested = true,
} = {}) {
  return openPopup({
    title,
    width: 360,
    nested,
    render(body, { close }) {
      const msg = document.createElement("div");
      msg.className = "ullc-preset-message";
      msg.textContent = message;

      const actions = document.createElement("div");
      actions.className = "ullc-preset-actions";

      if (showCancel) {
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "ullc-preset-btn";
        cancel.textContent = cancelLabel;
        cancel.addEventListener("click", (e) => {
          e.stopPropagation();
          close();
        });
        actions.appendChild(cancel);
      }

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "ullc-preset-btn" + (danger ? " danger" : " primary");
      confirm.textContent = confirmLabel;
      confirm.addEventListener("click", (e) => {
        e.stopPropagation();
        close();
        onConfirm?.();
      });
      actions.appendChild(confirm);

      body.append(msg, actions);
    },
  });
}
