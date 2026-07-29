import { actionButton } from "./actions.js";
import { appendContent, element, ownerDocument, uniqueId } from "./dom.js";

export function modalSheet({
  title,
  description = null,
  content = [],
  dismissLabel = "Close",
  onDismiss
} = {}) {
  if (!title) {
    throw new TypeError("modalSheet requires a title.");
  }

  const titleId = uniqueId("sheet-title");
  const dialog = element("dialog", {
    className: "modal-sheet",
    attributes: { "aria-labelledby": titleId }
  });
  const header = element("header", { className: "modal-sheet__header" });
  header.append(
    element("h2", {
      className: "modal-sheet__title",
      text: title,
      attributes: { id: titleId }
    })
  );
  const closeButton = element("button", {
    className: "modal-sheet__close",
    text: "×",
    attributes: {
      type: "button",
      "aria-label": dismissLabel
    }
  });
  header.append(closeButton);

  if (description) {
    const descriptionId = uniqueId("sheet-description");
    dialog.setAttribute("aria-describedby", descriptionId);
    header.append(
      element("p", {
        className: "modal-sheet__description",
        text: description,
        attributes: { id: descriptionId }
      })
    );
  }

  const body = element("div", { className: "modal-sheet__body" });
  appendContent(body, content);
  dialog.append(header, body);

  let returnFocus = null;
  const notifyDismiss = (reason) => {
    if (typeof onDismiss === "function") {
      onDismiss(reason);
    }
  };

  dialog.openSheet = (trigger = ownerDocument().activeElement) => {
    returnFocus = trigger?.focus ? trigger : null;
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    closeButton.focus();
  };

  dialog.closeSheet = (reason = "dismissed") => {
    if (typeof dialog.close === "function") {
      dialog.close(reason);
    } else {
      dialog.removeAttribute("open");
    }
    notifyDismiss(reason);
    returnFocus?.focus();
  };

  closeButton.addEventListener("click", () => dialog.closeSheet("close-button"));
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dialog.closeSheet("escape");
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      dialog.closeSheet("backdrop");
    }
  });

  return dialog;
}

export function toast({
  message,
  tone = "info",
  duration = 0,
  onDismiss
} = {}) {
  if (!message) {
    throw new TypeError("toast requires a message.");
  }

  const toneIcon = {
    info: "i",
    success: "✓",
    warning: "!",
    error: "!"
  }[tone] || "i";
  const node = element("aside", {
    className: "toast",
    attributes: {
      "data-tone": tone,
      role: tone === "error" ? "alert" : "status",
      "aria-live": tone === "error" ? "assertive" : "polite",
      "aria-atomic": "true"
    }
  });
  node.append(
    element("span", {
      className: "toast__icon",
      text: toneIcon,
      attributes: { "aria-hidden": "true" }
    }),
    element("span", { className: "toast__message", text: message })
  );
  const dismissButton = element("button", {
    className: "toast__dismiss",
    text: "×",
    attributes: {
      type: "button",
      "aria-label": "Dismiss notification"
    }
  });
  node.append(dismissButton);

  let timer = null;
  node.dismiss = (reason = "dismissed") => {
    if (timer !== null) {
      globalThis.clearTimeout(timer);
    }
    node.remove();
    if (typeof onDismiss === "function") {
      onDismiss(reason);
    }
  };
  dismissButton.addEventListener("click", () => node.dismiss("close-button"));

  if (Number.isFinite(duration) && duration > 0) {
    timer = globalThis.setTimeout(() => node.dismiss("timeout"), duration);
  }

  return node;
}

export function confirmation({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel
} = {}) {
  const messageNode = element("p", { text: message });
  const actions = element("div", { className: "confirmation__actions" });
  const dialog = modalSheet({
    title,
    content: [messageNode, actions],
    dismissLabel: cancelLabel,
    onDismiss: (reason) => {
      if (
        typeof onCancel === "function"
        && !["confirmed", "cancel-button"].includes(reason)
      ) {
        onCancel(reason);
      }
    }
  });
  const confirmButton = actionButton({
    label: confirmLabel,
    variant: destructive ? "danger" : "primary",
    onActivate: (event) => {
      if (typeof onConfirm === "function") {
        onConfirm(event);
      }
      dialog.closeSheet("confirmed");
    }
  });
  const cancelButton = actionButton({
    label: cancelLabel,
    variant: "secondary",
    onActivate: (event) => {
      if (typeof onCancel === "function") {
        onCancel("cancel-button", event);
      }
      dialog.closeSheet("cancel-button");
    }
  });
  actions.append(confirmButton, cancelButton);
  return dialog;
}

