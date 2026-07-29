import { element } from "./dom.js";

const VARIANTS = new Set(["primary", "secondary", "quiet", "danger"]);

function actionClass(variant) {
  const safeVariant = VARIANTS.has(variant) ? variant : "secondary";
  return `action action--${safeVariant}`;
}

function addContents(node, { label, icon }) {
  if (icon) {
    node.append(
      element("span", {
        className: "action__icon",
        text: icon,
        attributes: { "aria-hidden": "true" }
      })
    );
  }

  node.append(element("span", { className: "action__label", text: label }));
}

export function actionLink({
  label,
  href,
  variant = "secondary",
  icon = null,
  ariaLabel,
  onActivate
} = {}) {
  if (!label) {
    throw new TypeError("actionLink requires a label.");
  }

  const link = element("a", {
    className: actionClass(variant),
    attributes: {
      href: href || "#",
      "aria-label": ariaLabel
    }
  });
  addContents(link, { label, icon });

  if (typeof onActivate === "function") {
    link.addEventListener("click", onActivate);
  }

  return link;
}

export function actionButton({
  label,
  variant = "primary",
  icon = null,
  ariaLabel,
  disabled = false,
  pending = false,
  type = "button",
  onActivate
} = {}) {
  if (!label) {
    throw new TypeError("actionButton requires a label.");
  }

  const button = element("button", {
    className: actionClass(variant),
    attributes: {
      type,
      "aria-label": ariaLabel,
      "aria-busy": pending ? "true" : undefined
    }
  });
  button.disabled = Boolean(disabled || pending);
  addContents(button, { label, icon });

  if (typeof onActivate === "function") {
    button.addEventListener("click", onActivate);
  }

  return button;
}

