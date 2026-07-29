let nextId = 0;

export function ownerDocument() {
  if (!globalThis.document?.createElement) {
    throw new Error("Crazy Rummy components require a browser document.");
  }
  return globalThis.document;
}

export function uniqueId(prefix) {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

export function element(tag, options = {}) {
  const node = ownerDocument().createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  if (options.text !== undefined && options.text !== null) {
    node.textContent = String(options.text);
  }

  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(name, value === true ? "" : String(value));
    }
  }

  return node;
}

export function appendContent(parent, content) {
  const items = Array.isArray(content) ? content : [content];

  for (const item of items.flat(Infinity)) {
    if (item === undefined || item === null || item === false) {
      continue;
    }

    if (typeof item === "string" || typeof item === "number") {
      parent.append(ownerDocument().createTextNode(String(item)));
      continue;
    }

    if (typeof item === "object" && typeof item.nodeType === "number") {
      parent.append(item);
      continue;
    }

    throw new TypeError("Component content must be text or DOM nodes, never HTML.");
  }

  return parent;
}

export function setBooleanAttribute(node, name, value) {
  if (value) {
    node.setAttribute(name, "true");
  } else {
    node.setAttribute(name, "false");
  }
}

