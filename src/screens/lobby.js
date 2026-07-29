import { actionButton, connectionState } from "../components/index.js";
import { copy, element, field, panel, routeLink, screenWithMenu, stack } from "./helpers.js";
import {
  createUnavailableOnlineLobbySession,
  freshnessCopy,
  onlineErrorCopy,
  tableSummary
} from "./online-ui.js";

function connectionFor(snapshot) {
  const error = snapshot?.error;
  const status = snapshot?.presence?.status;
  const state = !snapshot?.online ? "offline" : error ? "error" : status === "stale" ? "stale" : "online";
  return connectionState({
    state,
    label: state === "offline" ? "Offline" : state === "error" ? "Couldn’t refresh" : "Online lobby",
    detail: error ? onlineErrorCopy(error, "Last good results are kept. Try again.") : freshnessCopy(snapshot),
    announce: true
  });
}

function visibilityChoice(value, label, detail) {
  return element("label", { className: "online-radio" },
    element("input", { type: "radio", name: "table-visibility", value, checked: value === "OPEN" }),
    element("span", { text: label }),
    element("small", { text: detail })
  );
}

export function lobbyScreen({ navigate, router, onlineSession = createUnavailableOnlineLobbySession() }) {
  let snapshot = onlineSession.getSnapshot?.() ?? {};
  let pending = null;
  let message = null;
  let preview = null;
  let createOpen = false;
  let joinOpen = false;
  const content = element("div", { className: "online-workspace" });

  const rerender = () => {
    const online = Boolean(snapshot.online);
    const tables = Array.isArray(snapshot.tables) ? snapshot.tables.map(tableSummary) : [];
    const items = [connectionFor(snapshot)];
    const actions = stack(
      actionButton({ label: online ? "Go offline" : "Go online", variant: online ? "secondary" : "primary", pending: pending === "presence", onActivate: () => run("presence", online ? "goOffline" : "goOnline") }),
      actionButton({ label: "Create a table", disabled: !online, onActivate: () => { createOpen = !createOpen; rerender(); } }),
      actionButton({ label: "Join with a code", variant: "secondary", disabled: !online, onActivate: () => { joinOpen = !joinOpen; rerender(); } }),
      actionButton({ label: "Refresh now", variant: "quiet", disabled: !online, pending: pending === "refresh", onActivate: () => run("refresh", "refresh") })
    );
    items.push(actions);
    if (message) items.push(element("p", { className: "online-message", role: "status", text: message }));

    if (createOpen) {
      const capacity = element("select", { id: "table-capacity", name: "capacity" }, [3, 4, 5, 6].map((count) => element("option", { value: count, text: `${count} seats` })));
      const form = element("form", { className: "online-form", onSubmit: (event) => {
        event.preventDefault();
        const visibility = form.elements.namedItem("table-visibility")?.value ?? "OPEN";
        run("create", "createTable", { visibility, capacity: Number(capacity.value) });
      } },
      element("h2", { text: "Create a match" }),
      element("label", { htmlFor: "table-capacity", text: "Seats (3–6)" }), capacity,
      element("fieldset", { className: "online-choice" }, element("legend", { text: "Audience" }),
        visibilityChoice("OPEN", "Open table", "Publicly listed and joinable while a seat is available."),
        visibilityChoice("CLOSED", "Closed table", "Never listed publicly; players need a join code or link.")),
      copy("Rules: Crazy Rummy · 13 hands. Only this confirmed rules preset is available."),
      routeLink("View rules for this table", "/rules", "quiet"),
      actionButton({ label: "Create table", type: "submit", pending: pending === "create" })
      );
      items.push(form);
    }
    if (joinOpen) {
      const code = field({ id: "join-code", label: "Enter a table code", inputMode: "text", hint: "Paste a code; spaces and hyphens are accepted." });
      const form = element("form", { className: "online-form", onSubmit: (event) => {
        event.preventDefault();
        const normalized = code.input.value.replace(/[^a-z0-9]/gi, "").toLowerCase();
        if (!normalized) { message = "Enter a table code to continue."; rerender(); return; }
        run("join-code", "joinByCode", { code: normalized });
      } }, code.wrapper, actionButton({ label: "Find and join table", type: "submit", pending: pending === "join-code" }));
      items.push(form);
    }
    const tableCards = tables.map((table) => element("article", { className: "table-card", dataset: { tableId: table.id } },
      element("h3", { text: `${table.name} · ${table.occupied}/${table.capacity || "?"}` }),
      copy(`Hosted by ${table.host} · ${table.state.toLowerCase()} · ${table.rules}`),
      actionButton({ label: "Preview table", variant: "secondary", disabled: !online, onActivate: () => { preview = table; rerender(); } })
    ));
    items.push(panel("Open tables", copy(`${tables.length} open · ${freshnessCopy(snapshot)}`), tableCards.length ? tableCards : copy("No open tables found right now. Create one or refresh.")));
    if (preview) items.push(element("section", { className: "online-preview", "aria-label": "Table preview" },
      element("h2", { text: preview.name }), copy(`Hosted by ${preview.host} · ${preview.occupied}/${preview.capacity} seats · ${preview.rules}`),
      actionButton({ label: "Join table", pending: pending === "join", onActivate: () => run("join", "joinTable", { tableId: preview.id }) })
    ));
    content.replaceChildren(...items);
  };
  const run = async (name, method, args) => {
    if (pending) return;
    pending = name; message = null; rerender();
    try {
      await onlineSession[method]?.(args);
      snapshot = onlineSession.getSnapshot?.() ?? snapshot;
      if (["createTable", "joinTable", "joinByCode"].includes(method)) navigate("/waiting-room");
    } catch (error) { message = onlineErrorCopy(error); }
    pending = null; rerender();
  };
  const unsubscribe = onlineSession.subscribe?.((next) => { snapshot = next ?? snapshot; rerender(); }) ?? (() => {});
  rerender();
  const shell = screenWithMenu({ id: "lobby", context: "Online play", title: "Lobby", status: null, router, content: [content], menuContent: [actionButton({ label: "Refresh lobby", variant: "secondary", onActivate: () => run("refresh", "refresh") })] });
  const dispose = shell.disposeScreen;
  shell.disposeScreen = () => { unsubscribe(); dispose?.(); };
  return shell;
}
