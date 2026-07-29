import { element } from "./dom.js";

export function routeLine({
  current = 1,
  total = 13,
  label,
  compact = false
} = {}) {
  const safeTotal = Math.max(1, Math.trunc(Number(total) || 13));
  const safeCurrent = Math.min(safeTotal, Math.max(1, Math.trunc(Number(current) || 1)));
  const accessibleLabel = label || `Hand ${safeCurrent} of ${safeTotal}`;
  const route = element("nav", {
    className: "route-line",
    attributes: {
      "aria-label": accessibleLabel,
      "data-compact": String(Boolean(compact))
    }
  });
  const stations = element("ol", {
    className: "route-line__stations",
    attributes: { "aria-hidden": "true" }
  });

  for (let station = 1; station <= safeTotal; station += 1) {
    const state = station < safeCurrent
      ? "complete"
      : station === safeCurrent
        ? "current"
        : "future";
    stations.append(
      element("li", {
        className: "route-line__station",
        text: state === "complete" ? "✓" : station,
        attributes: {
          "data-state": state,
          title: `Hand ${station}: ${state}`
        }
      })
    );
  }

  const compactView = element("div", {
    className: "route-line__compact",
    attributes: { "aria-hidden": "true" }
  });
  compactView.append(
    element("span", { text: "ROUTE" }),
    element("span", {
      text: `${String(safeCurrent).padStart(2, "0")} / ${String(safeTotal).padStart(2, "0")}`
    })
  );
  route.append(
    element("span", { className: "visually-hidden", text: accessibleLabel }),
    stations,
    compactView
  );
  return route;
}

