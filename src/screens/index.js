import { finalResultScreen, handResultScreen } from "./results.js";
import { gameScreen } from "./game.js";
import { lobbyScreen } from "./lobby.js";
import { rulesScreen, settingsScreen } from "./reference.js";
import { identityScreen, startupScreen } from "./startup.js";
import { waitingRoomScreen } from "./waiting-room.js";

const SCREEN_FACTORIES = Object.freeze({
  startup: startupScreen,
  identity: identityScreen,
  lobby: lobbyScreen,
  "waiting-room": waitingRoomScreen,
  game: gameScreen,
  "hand-result": handResultScreen,
  "final-result": finalResultScreen,
  rules: rulesScreen,
  settings: settingsScreen
});

export function renderScreen(route, context) {
  const factory = SCREEN_FACTORIES[route.id] ?? SCREEN_FACTORIES.lobby;
  return factory({ ...context, onlineGameSession: context.onlineGameSession ?? context.onlineMatchSession ?? null });
}
