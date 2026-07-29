import { actionLink } from "./actions.js";
import { appendContent, element, uniqueId } from "./dom.js";

function normalizeAction(action) {
  if (!action) {
    return null;
  }

  if (typeof action.nodeType === "number") {
    return action;
  }

  if (typeof action === "object" && action.label) {
    return actionLink(action);
  }

  throw new TypeError("Screen actions must be an action node or action-link data.");
}

export function createScreenShell({
  context,
  title,
  action = null,
  status = null,
  content = [],
  kind = "detail",
  labelledBy
} = {}) {
  if (!title) {
    throw new TypeError("createScreenShell requires a title.");
  }

  const titleId = labelledBy || uniqueId("screen-title");
  const shell = element("main", {
    className: `screen-shell screen-shell--${String(kind).replace(/[^a-z0-9-]/gi, "")}`,
    attributes: { "aria-labelledby": titleId }
  });
  const header = element("header", { className: "screen-shell__header" });

  if (context) {
    header.append(element("p", { className: "screen-shell__context", text: context }));
  }

  header.append(
    element("h1", {
      className: "screen-shell__title",
      text: title,
      attributes: { id: titleId }
    })
  );

  const actionNode = normalizeAction(action);
  if (actionNode) {
    const actionSlot = element("div", { className: "screen-shell__action" });
    actionSlot.append(actionNode);
    header.append(actionSlot);
  }

  if (status) {
    const statusSlot = element("div", { className: "screen-shell__status" });
    appendContent(statusSlot, status);
    header.append(statusSlot);
  }

  const contentSlot = element("div", { className: "screen-shell__content" });
  appendContent(contentSlot, content);
  shell.append(header, contentSlot);
  return shell;
}

