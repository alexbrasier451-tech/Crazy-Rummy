import {
  actionButton,
  actionLink,
  createScreenShell,
  modalSheet
} from "../components/index.js";

export function element(tagName, options = {}, ...children) {
  const node = document.createElement(tagName);
  let deferredValue;
  let hasDeferredValue = false;

  for (const [key, value] of Object.entries(options)) {
    if (value == null) continue;
    if (key === "value") {
      deferredValue = value;
      hasDeferredValue = true;
    } else if (key === "className") {
      node.className = value;
    } else if (key === "text") {
      node.textContent = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in node && key !== "list") {
      node[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  if (hasDeferredValue) node.value = deferredValue;
  return node;
}

export function copy(text, className = "screen-copy") {
  return element("p", { className, text });
}

export function heading(text, level = 2) {
  return element(`h${level}`, { text });
}

export function panel(title, ...content) {
  return element(
    "section",
    { className: "screen-panel" },
    heading(title),
    ...content
  );
}

export function stack(...items) {
  return element("div", { className: "action-stack" }, ...items);
}

export function illustrativeNotice(detail) {
  return element(
    "aside",
    {
      className: "placeholder-notice",
      role: "note",
      "aria-label": "Illustrative placeholder"
    },
    element("strong", { text: "Illustrative screen" }),
    copy(
      detail
        ?? "Sample local data only. Online sessions and gameplay are not connected yet."
    )
  );
}

export function bulletList(items, { ordered = false, className = "" } = {}) {
  const list = element(ordered ? "ol" : "ul", { className });
  items.forEach((item) => list.append(element("li", {}, item)));
  return list;
}

export function routeLink(label, path, variant = "secondary") {
  return actionLink({ label, href: `#${path}`, variant });
}

export function routeButton(label, path, navigate, variant = "primary", options = {}) {
  return actionButton({
    label,
    variant,
    ...options,
    onActivate: () => navigate(path)
  });
}

export function field({
  id,
  label,
  type = "text",
  value,
  hint,
  minLength,
  maxLength,
  inputMode,
  required = false
}) {
  const input = element("input", {
    id,
    name: id,
    type,
    value,
    minLength,
    maxLength,
    inputMode,
    required,
    "aria-describedby": hint ? `${id}-hint` : null
  });
  const wrapper = element(
    "div",
    { className: "field" },
    element("label", { htmlFor: id, text: label }),
    input
  );
  if (hint) {
    wrapper.append(element("p", { id: `${id}-hint`, className: "field-hint", text: hint }));
  }
  return { wrapper, input };
}

export function screenShell({
  id,
  context,
  title,
  action,
  status,
  content,
  kind = "detail"
}) {
  const shell = createScreenShell({
    context,
    title,
    action,
    status,
    content,
    kind,
    labelledBy: `${id}-title`
  });
  shell.dataset.screen = id;
  shell.tabIndex = -1;
  return shell;
}

export function screenWithMenu({
  id,
  context,
  title,
  status,
  content,
  router,
  menuContent = []
}) {
  let sheet;
  let isOpen = false;
  let closeBackLayer = () => {};
  const menuButton = actionButton({
    label: "Menu",
    variant: "quiet",
    ariaLabel: `Open ${title} menu`,
    onActivate: () => {
      isOpen = true;
      closeBackLayer = router.addBackLayer(() => {
        isOpen = false;
        sheet.closeSheet("system-back");
        menuButton.focus();
      });
      sheet.openSheet();
    }
  });
  const shell = screenShell({
    id,
    context,
    title,
    action: menuButton,
    status,
    content
  });

  sheet = modalSheet({
    title: `${title} menu`,
    description: "Safe navigation and local app information.",
    content: [
      stack(
        routeLink("Rules", "/rules"),
        routeLink("Settings", "/settings"),
        ...menuContent
      )
    ],
    dismissLabel: "Close menu",
    onDismiss: () => {
      isOpen = false;
      closeBackLayer();
    }
  });
  shell.append(sheet);

  shell.disposeScreen = () => {
    if (isOpen) closeBackLayer();
  };
  return shell;
}
