import { actionButton, connectionState, playerChip } from "../components/index.js";
import { normalizePreferences } from "../app/preferences.js";
import { bulletList, copy, element, panel, routeLink, screenWithMenu, stack } from "./helpers.js";
import { createUnavailableOnlineLobbySession, onlineErrorCopy, tableSummary } from "./online-ui.js";

function seatsFor(table) {
  const seats = table?.seats ?? table?.participants ?? [];
  return Array.isArray(seats) ? seats : [];
}

function safeInviteCode(table, snapshot) {
  const code = table?.code ?? snapshot?.room?.invite?.code;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

export function waitingRoomScreen({ navigate, router, onlineSession = createUnavailableOnlineLobbySession(), localSession, startOnlineMatch }) {
  let snapshot = onlineSession.getSnapshot?.() ?? {};
  let pending = null;
  let message = null;
  let enteringStartedMatch = false;
  const content = element("div", { className: "online-workspace" });

  const copyInvite = async (code) => {
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("Copying is not available in this browser.");
      await globalThis.navigator.clipboard.writeText(code);
      message = "Invite code copied. Send it only to the players you want at this table.";
    } catch (error) {
      message = error?.message ?? "Could not copy the invite code. Select the code and copy it manually.";
    }
    render();
  };
  const shareInvite = async (code) => {
    try {
      if (typeof globalThis.navigator?.share !== "function") throw new Error("Sharing is not available in this browser. Copy the code instead.");
      await globalThis.navigator.share({ title: "Crazy Rummy table", text: `Join my Crazy Rummy table with code ${code}.` });
      message = "Invite ready to send.";
    } catch (error) {
      if (error?.name === "AbortError") return;
      message = error?.message ?? "Could not open sharing. Copy the code instead.";
    }
    render();
  };

  const confirmAndRun = (name, method, prompt) => {
    if (globalThis.confirm?.(prompt) !== true) return;
    void run(name, method);
  };

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
    const isConnecting = room.status === "CONNECTING";
    const busy = Boolean(pending) || enteringStartedMatch || isConnecting;
    const capacity = table.capacity || 6;
    const occupied = seats.length;
    const inviteCode = safeInviteCode(table, snapshot);
    const state = !snapshot.online ? "offline" : snapshot.error ? "error" : "online";
    const readySeats = seats.filter((seat) => seat.ready);
    const acceptedSeats = seats.filter((seat) => seat.ready && seat.acceptedAt !== null && seat.acceptedAt !== undefined);
    const enoughPlayers = occupied >= 2;
    const everyoneReady = readySeats.length === occupied && occupied > 0;
    const roomConfirmed = acceptedSeats.length === occupied && occupied > 0;
    const canStart = isHost && enoughPlayers && everyoneReady && roomConfirmed;
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

    const joinDetails = table.visibility === "CLOSED"
      ? panel(
          "Private invite",
          inviteCode
            ? element("div", { className: "invite-code" },
              element("span", { className: "invite-code__label", text: "Invite code" }),
              element("output", { className: "invite-code__value", text: inviteCode, "aria-label": `Invite code ${inviteCode}` }),
              copy("Share this code only with the players you want to invite. It is not listed in Open tables.", "invite-code__hint"),
              element("div", { className: "invite-code__actions" },
                actionButton({ label: "Copy code", variant: "secondary", disabled: busy, onActivate: () => { void copyInvite(inviteCode); } }),
                typeof globalThis.navigator?.share === "function"
                  ? actionButton({ label: "Share invite", variant: "secondary", disabled: busy, onActivate: () => { void shareInvite(inviteCode); } })
                  : null
              )
            )
            : element("div", { className: "invite-code invite-code--unavailable" },
              copy("The private invite code is not available on this device yet."),
              actionButton({ label: "Refresh room", variant: "secondary", disabled: busy, pending: pending === "refresh", onActivate: () => run("refresh", "refresh") })
            ),
          routeLink("View rules for this table", "/rules")
        )
      : panel(
          "Join details",
          copy("Open table · players can join from the Open table list while a seat remains."),
          routeLink("View rules for this table", "/rules")
        );

    const readiness = isHost && room.status !== "STARTED"
      ? panel(
          "Ready to start?",
          bulletList([
            `${enoughPlayers ? "Ready" : "Waiting"}: at least 2 players (${occupied}/${capacity} seated).`,
            `${everyoneReady ? "Ready" : "Waiting"}: every seated player has selected Ready (${readySeats.length}/${occupied || 0}).`,
            `${roomConfirmed ? "Ready" : "Waiting"}: the lobby has confirmed every ready seat (${acceptedSeats.length}/${occupied || 0}).`
          ], { className: "readiness-list" }),
          copy(canStart
            ? "All checks are complete. You can start the match."
            : "Start match stays unavailable until every check above is ready. Refresh room if a player has just changed their status.", "field-hint")
        )
      : null;

    content.replaceChildren(
      connectionState({ state, label: state === "online" ? `${occupied} of ${capacity} players · ${readySeats.length} ready` : "Waiting room needs attention", detail: snapshot.error ? onlineErrorCopy(snapshot.error) : "Room updates follow the lobby session.", announce: true }),
      joinDetails,
      panel("Seats", element("div", { className: "seat-grid" }, seatNodes)),
      panel(
        "This device's seat",
        copy(localSeat
          ? "This device is seated in this room. Keep it open until the match begins; once play starts, this device keeps the recovery details needed to reconnect."
          : "This device is not yet confirmed as a seated player. Refresh the room before trying to start or join the match."),
        copy("Avoid reloading or applying an app update while the match is starting. If a live table is interrupted later, the game will show its recovery state before accepting another action.", "waiting-room-caution")
      ),
      readiness,
      message ? element("p", { className: "online-message", role: "status", text: message }) : null,
      stack(
        isConnecting
          ? element("p", { className: "waiting-room-connecting", role: "status", text: "Connecting players… the match will open when the host confirms every player is connected." })
          : actionButton({ label: ready ? "I'm not ready" : "I'm ready", pending: pending === "ready", disabled: !snapshot.online || busy || !localSeat, onActivate: () => run("ready", "setReady", { ready: !ready }) }),
        isHost && !isConnecting && room.status !== "STARTED" ? [
          actionButton({ label: canStart ? "Start match" : "Start match (waiting)", variant: "primary", pending: pending === "start", disabled: !snapshot.online || busy || !canStart, onActivate: () => run("start", "startMatch") }),
          actionButton({ label: "Cancel table…", variant: "danger", pending: pending === "cancel", disabled: !snapshot.online || busy || room.status !== "OPEN", onActivate: () => confirmAndRun("cancel", "cancelTable", "Cancel this table for every seated player? This cannot be undone.") })
        ] : room.status === "STARTED"
          ? actionButton({ label: "Join started match", variant: "primary", pending: enteringStartedMatch, disabled: busy, onActivate: () => enterStartedMatch() })
          : isConnecting
            ? null
          : copy(occupied < 2 ? "Waiting for at least 2 players." : "Waiting for the host to start after the room confirms every ready seat."),
        !isHost && !isConnecting && room.status !== "STARTED"
          ? actionButton({ label: "Leave waiting room…", variant: "danger", pending: pending === "leave", disabled: !snapshot.online || busy, onActivate: () => confirmAndRun("leave", "leave", "Leave this waiting room? You will need an open seat or invite code to come back.") })
          : null,
        actionButton({ label: "Refresh room", variant: "quiet", disabled: !snapshot.online || busy, pending: pending === "refresh", onActivate: () => run("refresh", "refresh") })
      )
    );
  };
  const run = async (name, method, args) => {
    if (pending || enteringStartedMatch) {
      message = "The waiting room is still finishing the previous request. Please wait.";
      render();
      return;
    }
    pending = name; message = null; render();
    try {
      await onlineSession[method]?.(args);
      snapshot = onlineSession.getSnapshot?.() ?? snapshot;
      if (method === "leave" || method === "cancelTable") navigate("/lobby");
      if (method === "startMatch") await enterStartedMatch();
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
    if (["CONNECTING", "STARTED"].includes(snapshot.room?.table?.status) && onlineSession.getMatchBootstrap?.() && !enteringStartedMatch) void enterStartedMatch();
  }) ?? (() => {});
  render();
  const shell = screenWithMenu({ id: "waiting-room", context: "Online play", title: "Waiting room", status: null, router, content: [content], menuContent: [actionButton({ label: "Refresh room", variant: "secondary", onActivate: () => run("refresh", "refresh") })] });
  const dispose = shell.disposeScreen;
  shell.disposeScreen = () => { unsubscribe(); dispose?.(); };
  return shell;
}
