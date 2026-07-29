import { RULES_VERSION } from "../../src/config.js";
import {
  DEFAULT_PROTOCOL_VERSION,
  createFakeLobbyService,
  createOnlineLobbySession
} from "../../src/online/index.js";
import { lobbyScreen } from "../../src/screens/lobby.js";
import { waitingRoomScreen } from "../../src/screens/waiting-room.js";

const app = document.querySelector("#app");
const scheduler = Object.freeze({
  setTimeout() { return 1; },
  clearTimeout() {}
});
const versions = Object.freeze({
  protocolVersion: DEFAULT_PROTOCOL_VERSION,
  rulesVersion: RULES_VERSION
});
const players = [
  { playerId: "host_0001", displayName: "Pat" },
  { playerId: "guest_001", displayName: "Alex" },
  { playerId: "guest_002", displayName: "Lee" },
  { playerId: "guest_003", displayName: "Jo" },
  { playerId: "guest_004", displayName: "Mina" },
  { playerId: "guest_005", displayName: "Sam" },
  { playerId: "guest_006", displayName: "Rae" }
];
const service = createFakeLobbyService();
const sessions = new Map();
let matchStartAttempts = 0;
const router = Object.freeze({
  addBackLayer() { return () => {}; }
});

function sessionFor(player) {
  if (!sessions.has(player.playerId)) {
    sessions.set(player.playerId, createOnlineLobbySession({
      service,
      player,
      ...versions,
      scheduler,
      jitterRatio: 0
    }));
  }
  return sessions.get(player.playerId);
}

function localSessionFor(player) {
  return { getSnapshot: () => ({ identity: player }) };
}

function mount(screen) {
  app.replaceChildren(screen);
}

function navigateFor(player) {
  return (path) => {
    document.body.dataset.lastNavigation = path;
    if (path === "/waiting-room") {
      queueMicrotask(() => renderWaitingRoom(player));
    }
  };
}

function renderLobby(player) {
  mount(lobbyScreen({
    navigate: navigateFor(player),
    router,
    onlineSession: sessionFor(player)
  }));
}

function renderWaitingRoom(player) {
  mount(waitingRoomScreen({
    navigate: navigateFor(player),
    router,
    onlineSession: sessionFor(player),
    localSession: localSessionFor(player),
    async startOnlineMatch() {
      matchStartAttempts += 1;
      throw new Error("Injected match connection failure.");
    }
  }));
}

async function fillOpenRoom() {
  for (const player of players.slice(2, 6)) {
    const session = sessionFor(player);
    await session.goOnline();
    const table = session.getSnapshot().tables[0];
    await session.joinTable({ tableId: table.tableId, revision: table.revision });
    await session.setReady(true);
  }
  await sessionFor(players[0]).refresh();
  renderWaitingRoom(players[0]);
}

async function startClosedJourney() {
  const host = sessionFor(players[0]);
  const creation = await host.createTable({ visibility: "CLOSED", capacity: 2 });
  const guest = sessionFor(players[6]);
  await guest.goOnline();
  document.body.dataset.closedCode = creation.invite.code;
  renderLobby(players[6]);
  return creation.invite.code;
}

async function prepareTwoPlayerStart() {
  const host = sessionFor(players[0]);
  const guest = sessionFor(players[6]);
  await host.refresh();
  await host.setReady(true);
  await guest.refresh();
  await guest.setReady(true);
  await host.refresh();
  renderWaitingRoom(players[0]);
}

const host = sessionFor(players[0]);
const guest = sessionFor(players[1]);
await host.goOnline();
await host.createTable({ visibility: "OPEN", capacity: 6 });
await guest.goOnline();
renderLobby(players[1]);

let pendingRefreshResolve = null;
let pendingLobbySession = null;
const pendingLobbyPlayer = { playerId: "pending_001", displayName: "Pending Pat" };

function mountLobbyDuringInitialRefresh() {
  const base = createFakeLobbyService();
  let firstList = true;
  const delayedService = {
    ...base,
    listTables(input) {
      if (!firstList) return base.listTables(input);
      firstList = false;
      return new Promise((resolve) => { pendingRefreshResolve = () => resolve(base.listTables(input)); });
    }
  };
  pendingLobbySession = createOnlineLobbySession({
    service: delayedService,
    player: pendingLobbyPlayer,
    ...versions,
    scheduler,
    jitterRatio: 0
  });
  mount(lobbyScreen({
    navigate: (path) => { document.body.dataset.lastNavigation = path; },
    router,
    onlineSession: pendingLobbySession
  }));
}

async function finishInitialRefresh() {
  pendingRefreshResolve?.();
  await new Promise((resolve) => queueMicrotask(resolve));
  await new Promise((resolve) => queueMicrotask(resolve));
  return pendingLobbySession?.getSnapshot?.();
}

globalThis.onlineHarness = Object.freeze({
  fillOpenRoom,
  startClosedJourney,
  prepareTwoPlayerStart,
  mountLobbyDuringInitialRefresh,
  finishInitialRefresh,
  matchStartAttempts: () => matchStartAttempts
});
