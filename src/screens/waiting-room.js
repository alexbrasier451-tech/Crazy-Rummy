import { actionButton, connectionState, playerChip } from "../components/index.js";
import { normalizePreferences } from "../app/preferences.js";
import { copy, element, panel, routeLink, screenWithMenu, stack } from "./helpers.js";
import { createUnavailableOnlineLobbySession, onlineErrorCopy, tableSummary } from "./online-ui.js";

function seatsFor(table) {
  const seats = table?.seats ?? table?.participants ?? [];
  return Array.isArray(seats) ? seats : [];
}

export function waitingRoomScreen({ navigate, router, onlineSession = createUnavailableOnlineLobbySession(), localSession, startOnlineMatch }) {
  let snapshot = onlineSession.getSnapshot?.() ?? {};
  let pending = null;
  let message = null;
  let enteringStartedMatch = false;
  const content = element("div", { className: "online-workspace" });
  const render = () => {
    const room = snapshot.room?.table;
    if (!room) {
      content.replaceChildren(connectionState({ state: "offline", label: "No active waiting room", detail: "Join or create a table from the lobby.", announce: true }), stack(actionButton({ label: "Return to Lobby", onActivate: () => navigate("/lobby") })));
      return;
    }
    const table = tableSummary(room);
    const seats = seatsFor(room);
    const localPlayerId = localSession?.getSnapshot?.().identity?.playerId;
    const localSeat = seats.find((seat) => (seat.playerId ?? seat.id) === localPlayerId);
    const isHost = Boolean(room.isHost ?? localSeat?.isHost ?? (room.hostPlayerId && room.hostPlayerId === localPlayerId));
    const ready = Boolean(localSeat?.ready);
    const capacity = table.capacity || 6;
    const occupied = seats.length;
    const inviteCode = table.code ?? snapshot.room?.invite?.code ?? null;
    const state = !snapshot.online ? "offline" : snapshot.error ? "error" : "online";
    const canStart = isHost && occupied >= 2 && seats.every((seat) => seat.ready && seat.acceptedAt !== null);
    const localMarker = normalizePreferences(localSession?.getSnapshot?.().preferences).marker;
    const seatNodes = [...seats].map((seat, index) => {
      const current = (seat.playerId ?? seat.id) === localPlayerId;
      return playerChip({
        name: seat.displayName ?? seat.name ?? `Player ${index + 1}`,
        marker: current ? localMarker : (seat.marker ?? "●"),
        state: seat.connectionState === "reconnecting" ? "reconnecting" : seat.ready ? "ready" : "waiting",
        current
      });
    });
    for (let index = occupied; index < capacity; index += 1) seatNodes.push(playerChip({ name: "Open seat", marker: "+", state: "waiting" }));
    content.replaceChildren(
      connectionState({ state, label: state === "online" ? `${occupied} of ${capacity} players · ${seats.filter((seat) => seat.ready).length} ready` : "Waiting room needs attention", detail: snapshot.error ? onlineErrorCopy(snapshot.error) : "Room updates follow the lobby session.", announce: true }),
      panel(
        "Join details",
        copy(
          table.visibility === "CLOSED"
            ? `Code ${inviteCode ?? "is unavailable"}`
            : "No code needed · join from the Open table list."
        ),
        copy(`${table.visibility === "CLOSED" ? "Closed table · code or invite only." : "Open table · publicly listed while seats remain."}`),
        routeLink("View rules for this table", "/rules")
      ),
      panel("Seats", element("div", { className: "seat-grid" }, seatNodes)),
      message ? element("p", { className: "online-message", role: "status", text: message }) : null,
      stack(
        actionButton({ label: ready ? "I’m not ready" : "I’m ready", pending: pending === "ready", disabled: !snapshot.online, onActivate: () => run("ready", "setReady", { ready: !ready }) }),
        isHost ? [
          actionButton({ label: "Start match", variant: "primary", pending: pending === "start", disabled: !snapshot.online || !canStart || room.status === "STARTED", onActivate: () => run("start", "startMatch") }),
          actionButton({ label: "Cancel table", variant: "danger", pending: pending === "cancel", disabled: !snapshot.online || room.status !== "OPEN", onActivate: () => run("cancel", "cancelTable") })
        ] : room.status === "STARTED"
          ? actionButton({ label: "Join started match", variant: "primary", pending: enteringStartedMatch, onActivate: () => enterStartedMatch() })
          : copy(occupied < 2 ? "Waiting for at least 2 players." : "Waiting for the host to start when every seat is ready."),
        actionButton({ label: "Leave waiting room", variant: "danger", pending: pending === "leave", disabled: !snapshot.online, onActivate: () => run("leave", "leave") }),
        actionButton({ label: "Refresh room", variant: "quiet", disabled: !snapshot.online, pending: pending === "refresh", onActivate: () => run("refresh", "refresh") })
      )
    );
  };
  const run = async (name, method, args) => {
    if (pending) return;
    pending = name; message = null; render();
    try {
      await onlineSession[method]?.(args);
      snapshot = onlineSession.getSnapshot?.() ?? snapshot;
      if (method === "leave" || method === "cancelTable") navigate("/lobby");
      if (method === "startMatch") {
        await enterStartedMatch();
      }
    } catch (error) { message = onlineErrorCopy(error); }
    pending = null; render();
  };
  const enterStartedMatch = async () => {
    if (enteringStartedMatch) return;
    if (typeof startOnlineMatch !== "function") throw new Error("Online match composition is unavailable.");
    enteringStartedMatch = true; render();
    try { await startOnlineMatch(); navigate("/game"); }
    catch (error) { message = onlineErrorCopy(error); enteringStartedMatch = false; render(); }
  };
  const unsubscribe = onlineSession.subscribe?.((next) => {
    snapshot = next ?? snapshot; render();
    if (snapshot.room?.table?.status === "STARTED" && onlineSession.getMatchBootstrap?.() && !enteringStartedMatch) void enterStartedMatch();
  }) ?? (() => {});
  render();
  const shell = screenWithMenu({ id: "waiting-room", context: "Online play", title: "Waiting room", status: null, router, content: [content], menuContent: [actionButton({ label: "Refresh room", variant: "secondary", onActivate: () => run("refresh", "refresh") })] });
  const dispose = shell.disposeScreen;
  shell.disposeScreen = () => { unsubscribe(); dispose?.(); };
  return shell;
}
