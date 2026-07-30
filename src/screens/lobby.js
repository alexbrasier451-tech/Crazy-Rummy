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
    label: state === "offline" ? "Offline" : state === "error" ? "Couldn't refresh" : "Online lobby",
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

function setupPanel({ id, title, content }) {
  return element("section", { id, className: "online-form online-form--setup", "aria-labelledby": `${id}-title` },
    element("h2", { id: `${id}-title`, text: title }),
    ...content
  );
}

export function lobbyScreen({ navigate, router, onlineSession = createUnavailableOnlineLobbySession() }) {
  let snapshot = onlineSession.getSnapshot?.() ?? {};
  let pending = null;
  let message = null;
  let activePanel = null;
  const content = element("div", { className: "online-workspace v11-lobby" });

  const togglePanel = (name) => {
    activePanel = activePanel === name ? null : name;
    message = null;
    rerender();
  };

  const rerender = () => {
    const online = Boolean(snapshot.online);
    const busy = Boolean(pending);
    const tables = Array.isArray(snapshot.tables) ? snapshot.tables.map(tableSummary) : [];
    const signal = connectionFor(snapshot);
    signal.classList.add("v11-lobby-signal");
    const items = [
      element(
        "section",
        { className: "v11-lobby-threshold", "aria-label": "Lobby arrival and connection" },
        element(
          "div",
          { className: "v11-lobby-threshold__board", "aria-hidden": "true" },
          element("span", { text: "NOW BOARDING" }),
          element("strong", { text: "CRAZY RUMMY" }),
          element("small", { text: "Route 13 · Moving wilds" })
        ),
        signal
      )
    ];
    const incompatibleOpenTableCount = Number(snapshot.discovery?.incompatibleOpenTableCount ?? 0);
    if (incompatibleOpenTableCount > 0) {
      items.push(element("aside", { className: "lobby-version-warning", role: "status" },
        element("strong", { text: `${incompatibleOpenTableCount} open ${incompatibleOpenTableCount === 1 ? "table is" : "tables are"} using a different version.` }),
        copy("Another table is using a different app or rules version. Check Settings for an available update before joining it."),
        routeLink("Check Settings", "/settings", "quiet")
      ));
    }

    if (!online) {
      items.push(stack(actionButton({
        label: "Go online",
        pending: pending === "presence",
        onActivate: () => run("presence", "goOnline")
      })));
    } else {
      const createButton = actionButton({
        label: activePanel === "create" ? "Hide create table" : "Create a table",
        disabled: busy,
        onActivate: () => togglePanel("create")
      });
      createButton.setAttribute("aria-expanded", String(activePanel === "create"));
      createButton.setAttribute("aria-controls", "create-table-panel");
      const joinButton = actionButton({
        label: activePanel === "join" ? "Hide join with a code" : "Join with a code",
        variant: "secondary",
        disabled: busy,
        onActivate: () => togglePanel("join")
      });
      joinButton.setAttribute("aria-expanded", String(activePanel === "join"));
      joinButton.setAttribute("aria-controls", "join-code-panel");
      items.push(element("section", { className: "lobby-start v11-lobby-gates", "aria-label": "Start or join a table" },
        element("h2", { text: "Start or join a table" }),
        copy("Create a new room, or use an invite code for a closed table."),
        element("div", { className: "lobby-start__actions" }, createButton, joinButton)
      ));
    }

    if (message) items.push(element("p", { className: "online-message", role: "status", text: message }));

    if (online && activePanel === "create") {
      const capacity = element("select", { id: "table-capacity", name: "capacity" }, [2, 3, 4, 5, 6].map((count) => element("option", { value: count, text: `${count} seats` })));
      const review = element("output", {
        className: "v11-create-review",
        "aria-live": "polite"
      });
      let form;
      const updateReview = () => {
        const visibility = form?.elements.namedItem("table-visibility")?.value ?? "OPEN";
        review.textContent = `${visibility === "OPEN" ? "Open" : "Closed"} · ${capacity.value} seats · Crazy Rummy · 13 hands.`;
      };
      form = element("form", { onSubmit: (event) => {
        event.preventDefault();
        const visibility = form.elements.namedItem("table-visibility")?.value ?? "OPEN";
        run("create", "createTable", { visibility, capacity: Number(capacity.value) });
      }, onChange: updateReview },
      element("label", { htmlFor: "table-capacity", text: "Seats (2–6)" }), capacity,
      element("fieldset", { className: "online-choice" }, element("legend", { text: "Audience" }),
        visibilityChoice("OPEN", "Open table", "Publicly listed and joinable while a seat is available."),
        visibilityChoice("CLOSED", "Closed table", "Never listed publicly; players need a join code or link.")),
      copy("Rules: Crazy Rummy · 13 hands. Only this confirmed rules preset is available."),
      routeLink("View rules for this table", "/rules", "quiet"),
      review,
      actionButton({ label: "Create table", type: "submit", disabled: busy, pending: pending === "create" }),
      actionButton({ label: "Cancel", variant: "quiet", disabled: busy, onActivate: () => togglePanel("create") })
      );
      updateReview();
      items.push(setupPanel({ id: "create-table-panel", title: "Create a match", content: [form] }));
    }
    if (online && activePanel === "join") {
      const code = field({ id: "join-code", label: "Enter a table code", inputMode: "text", hint: "Paste a code; spaces and hyphens are accepted." });
      const form = element("form", { onSubmit: (event) => {
        event.preventDefault();
        const normalized = code.input.value.replace(/[^a-z0-9]/gi, "").toLowerCase();
        if (!normalized) { message = "Enter a table code to continue."; rerender(); return; }
        run("join-code", "joinByCode", { code: normalized });
      } }, code.wrapper,
      actionButton({ label: "Find and join table", type: "submit", disabled: busy, pending: pending === "join-code" }),
      actionButton({ label: "Cancel", variant: "quiet", disabled: busy, onActivate: () => togglePanel("join") }));
      items.push(setupPanel({ id: "join-code-panel", title: "Join a closed table", content: [form] }));
    }

    const tableCards = tables.map((table) => {
      const joinRequest = `join:${table.id}`;
      return element("article", { className: "table-card v11-departure-ticket", dataset: { tableId: table.id } },
        element(
          "div",
          { className: "v11-departure-ticket__station", "aria-hidden": "true" },
          element("span", { text: `${table.occupied}` }),
          element("small", { text: `/ ${table.capacity || "?"}` })
        ),
        element("h3", { text: `${table.name} · ${table.occupied}/${table.capacity || "?"}` }),
        copy(`Hosted by ${table.host} · ${table.state.toLowerCase()} · ${table.rules}`, "screen-copy v11-departure-ticket__meta"),
        actionButton({
          label: "Join table",
          disabled: !online || busy,
          pending: pending === joinRequest,
          onActivate: () => run(joinRequest, "joinTable", { tableId: table.id })
        })
      );
    });
    const boardState = snapshot?.presence?.status === "updating" && !tableCards.length
      ? element(
          "div",
          { className: "v11-departures-empty v11-departures-empty--loading", role: "status" },
          element("span", { className: "v11-departures-empty__ticket", "aria-hidden": "true" }),
          copy("Updating… looking for open tables.")
        )
      : tableCards.length
        ? element("div", { className: "v11-departures-list" }, tableCards)
        : element(
            "div",
            { className: "v11-departures-empty", role: "status" },
            element("span", { className: "v11-departures-empty__ticket", "aria-hidden": "true" }),
            copy("No open tables found right now. Create one or refresh.")
          );
    const departures = panel("Open tables", copy(`${tables.length} open · ${freshnessCopy(snapshot)}`), boardState);
    departures.classList.add("v11-departures-board");
    items.push(departures);
    if (online) {
      items.push(element("div", { className: "lobby-utilities" },
        actionButton({ label: "Refresh now", variant: "quiet", disabled: busy, pending: pending === "refresh", onActivate: () => run("refresh", "refresh") }),
        actionButton({ label: "Go offline", variant: "quiet", disabled: busy, pending: pending === "presence", onActivate: () => run("presence", "goOffline") })
      ));
    }
    content.replaceChildren(...items);
  };
  const run = async (name, method, args) => {
    if (pending) {
      message = "The lobby is still finishing the previous request. Please wait.";
      rerender();
      return;
    }
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
  const shell = screenWithMenu({ id: "lobby", context: "Midnight departures · Online play", title: "Lobby", status: null, router, content: [content], menuContent: [actionButton({ label: "Refresh lobby", variant: "secondary", onActivate: () => run("refresh", "refresh") })] });
  const dispose = shell.disposeScreen;
  shell.disposeScreen = () => { unsubscribe(); dispose?.(); };
  return shell;
}
