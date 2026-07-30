import "./styles/index.css";

import { connectionState } from "./components/index.js";
import { createRouter } from "./app/router.js";
import { applyPreferencesToRoot, normalizePreferences } from "./app/preferences.js";
import {
  connectOnlineMatch,
  isRecoverableOnlineMatchSnapshot,
  onlineMatchRoute
} from "./app/online-match-start.js";
import {
  activatePwaUpdate,
  getPwaStatus,
  registerPwa,
  subscribePwaStatus
} from "./pwa/register.js";
import { onlineUpdateGuard } from "./pwa/update-guard.js";
import { renderScreen } from "./screens/index.js";
import { APP_NAME } from "./config.js";
import { createLocalGameSession } from "./local/index.js";
import { createCompletedSummaryStorage } from "./local/completed-summary.js";
import { createConfiguredOnlineLobbySession, createConfiguredOnlineMatchSession, restoreConfiguredOnlineMatchSession } from "./online/runtime.js";
import { createMatchRecoveryStorage } from "./online/recovery-storage.js";
import { createUnavailableOnlineLobbySession } from "./screens/online-ui.js";

const appRoot = document.querySelector("#app");

if (!appRoot) {
  throw new Error("Crazy Rummy could not find its app root.");
}

const localSession = createLocalGameSession();
let appliedPreferences = normalizePreferences(localSession.getSnapshot().preferences);
applyPreferencesToRoot(appliedPreferences);
let onlineSession;
let onlineIdentityKey;
let onlineMatchSession = null;
let onlineReplayPromise = null;
let activeScreen;
let pwaStatus = getPwaStatus();
let statusRenderScheduled = false;

localSession.subscribe((snapshot) => {
  const nextPreferences = normalizePreferences(snapshot.preferences);
  const autoRefreshChanged = nextPreferences.autoRefresh !== appliedPreferences.autoRefresh;
  appliedPreferences = nextPreferences;
  applyPreferencesToRoot(nextPreferences);
  if (autoRefreshChanged) {
    const refreshUpdate = onlineSession?.syncAutoRefresh?.();
    refreshUpdate?.catch?.(() => {
      // The lobby snapshot already carries service failures; preference saves
      // must not surface an unhandled background refresh rejection.
    });
  }
});

async function activateUpdateAndReload() {
  if (!pwaStatus.updateReady || !navigator.serviceWorker) return false;
  const updateGuard = onlineUpdateGuard({
    onlineSession,
    onlineMatchSession
  });
  if (updateGuard.blocked) {
    console.warn(`Crazy Rummy postponed the app update. ${updateGuard.reason}`);
    return false;
  }

  let removeControllerListener = () => {};
  const controllerChanged = new Promise((resolve) => {
    const onControllerChange = () => {
      removeControllerListener();
      resolve();
    };
    removeControllerListener = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  });

  try {
    const activationStarted = await activatePwaUpdate();
    if (!activationStarted) {
      removeControllerListener();
      return false;
    }
    await controllerChanged;
    window.location.reload();
    return true;
  } catch (error) {
    removeControllerListener();
    console.warn("Crazy Rummy could not activate the waiting app update.", error);
    return false;
  }
}

function currentOnlineSession() {
  const identity = localSession.getSnapshot().identity;
  const identityKey = identity
    ? `${identity.playerId}\u0000${identity.displayName}`
    : "anonymous";
  if (onlineSession && identityKey === onlineIdentityKey) return onlineSession;

  onlineSession?.dispose?.();
  onlineIdentityKey = identityKey;
  onlineSession = createConfiguredOnlineLobbySession({
    player: identity,
    autoRefresh: () => normalizePreferences(
      localSession.getSnapshot().preferences
    ).autoRefresh
  })
    ?? createUnavailableOnlineLobbySession();
  return onlineSession;
}

async function startOnlineMatch() {
  const lobby = currentOnlineSession();
  const bootstrap = lobby.getMatchBootstrap?.();
  const playerId = localSession.getSnapshot().identity?.playerId;
  if (!bootstrap || !playerId) throw new Error("The match start details are not available yet.");
  const previousMatch = onlineMatchSession;
  onlineMatchSession = null;
  const match = await connectOnlineMatch({
    lobby,
    bootstrap,
    playerId,
    previousMatch,
    createMatch: createConfiguredOnlineMatchSession
  });
  onlineMatchSession = match;
  return match;
}

async function disposeOnlineMatch() {
  const match = onlineMatchSession;
  onlineMatchSession = null;
  await match?.dispose?.();
}

function resetOnlineLobbySession() {
  onlineSession?.dispose?.();
  onlineSession = undefined;
  onlineIdentityKey = undefined;
  return currentOnlineSession();
}

async function startNewMatch({ mode } = {}) {
  if (mode !== "online") {
    localSession.reset();
    router.navigate("/game");
    return;
  }

  if (onlineReplayPromise) return onlineReplayPromise;
  onlineReplayPromise = (async () => {
    const previousLobby = currentOnlineSession().getSnapshot?.();
    const identity = localSession.getSnapshot().identity;
    const previousTable = previousLobby?.room?.table;
    const localWasHost = previousTable?.hostPlayerId === identity?.playerId
      || previousTable?.isHost === true;
    await disposeOnlineMatch();
    const lobby = resetOnlineLobbySession();
    if (localWasHost && typeof lobby.createTable === "function") {
      try {
        await lobby.createTable({
          visibility: previousTable?.visibility ?? "CLOSED",
          capacity: previousTable?.capacity ?? 6
        });
        router.navigate("/waiting-room");
        return;
      } catch {
        // The lobby remains a safe, explicit fallback if a fresh room cannot be
        // requested from the managed service.
      }
    }
    router.navigate("/lobby");
  })();
  try {
    return await onlineReplayPromise;
  } finally {
    onlineReplayPromise = null;
  }
}

async function returnToLobby() {
  await disposeOnlineMatch();
  resetOnlineLobbySession();
  router.navigate("/lobby");
}

async function copyResultSummary(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const fallback = document.createElement("textarea");
  fallback.value = text;
  fallback.readOnly = true;
  fallback.style.position = "fixed";
  fallback.style.opacity = "0";
  document.body.append(fallback);
  fallback.select();
  const copied = document.execCommand?.("copy") === true;
  fallback.remove();
  if (!copied) throw new Error("Clipboard sharing is unavailable on this device.");
}

async function clearDeviceData() {
  await disposeOnlineMatch();
  createMatchRecoveryStorage().clearAll?.();
  createCompletedSummaryStorage().remove();
  localSession.clearDeviceData();
  resetOnlineLobbySession();
}

const router = createRouter({
  onRouteChange(route, { focus }) {
    activeScreen?.disposeScreen?.();

    const nextScreen = renderScreen(route, {
      navigate: (path, options) => router.navigate(path, options),
      back: () => router.back(),
      router,
      localSession,
      onlineSession: currentOnlineSession(),
      onlineMatchSession,
      onlineGameSession: onlineMatchSession,
      gameSession: onlineMatchSession ?? localSession,
      startOnlineMatch,
      onStartNewMatch: startNewMatch,
      onReturnToLobby: returnToLobby,
      onCopyResultSummary: copyResultSummary,
      clearDeviceData,
      completedSummary: createCompletedSummaryStorage().read(),
      pwaStatus,
      activateUpdate: activateUpdateAndReload
    });
    nextScreen.id = "main-content";
    nextScreen.dataset.route = route.path;

    const content = [];
    if (pwaStatus.online === false) {
      content.push(
        connectionState({
          state: "offline",
          label: "You’re offline",
          detail:
            "Online play is unavailable. Cached rules and settings remain available; remote play can resume after you reconnect.",
          announce: true
        })
      );
    }
    content.push(nextScreen);

    appRoot.replaceChildren(...content);
    activeScreen = nextScreen;
    document.title = `${route.label} · ${APP_NAME}`;

    if (focus) {
      requestAnimationFrame(() => {
        const heading = nextScreen.querySelector("h1");
        if (heading) {
          heading.tabIndex = -1;
          heading.focus();
        } else {
          nextScreen.focus();
        }
      });
    }
  }
});

appRoot.addEventListener("click", (event) => {
  if (
    event.defaultPrevented
    || event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) {
    return;
  }

  const link = event.target.closest("a[href^='#/']");
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

  event.preventDefault();
  router.navigate(link.getAttribute("href").slice(1));
});

document.addEventListener("click", (event) => {
  const skipLink = event.target.closest("a[href='#main-content']");
  if (!skipLink || event.defaultPrevented) return;

  event.preventDefault();
  activeScreen?.focus({ preventScroll: true });
  activeScreen?.scrollIntoView({ block: "start" });
}, true);

window.addEventListener("beforeunload", (event) => {
  if (!onlineUpdateGuard({ onlineSession, onlineMatchSession }).blocked) return;
  event.preventDefault();
  event.returnValue = "";
});

router.start();

queueMicrotask(async () => {
  const playerId = localSession.getSnapshot().identity?.playerId;
  if (!playerId || onlineMatchSession) return;
  const restored = restoreConfiguredOnlineMatchSession({ playerId });
  if (!restored) return;
  try {
    onlineMatchSession = restored;
    await onlineMatchSession.start();
    router.navigate(
      onlineMatchRoute(onlineMatchSession.getSnapshot?.()),
      { replace: true, focus: true }
    );
  } catch {
    const snapshot = onlineMatchSession?.getSnapshot?.();
    if (isRecoverableOnlineMatchSnapshot(snapshot)) {
      router.navigate(
        onlineMatchRoute(snapshot),
        { replace: true, focus: true }
      );
      return;
    }
    await onlineMatchSession.dispose?.();
    onlineMatchSession = null;
  }
});

subscribePwaStatus((nextStatus) => {
  const onlineChanged = pwaStatus.online !== nextStatus.online;
  const statusChanged = pwaStatus.phase !== nextStatus.phase
    || pwaStatus.updateReady !== nextStatus.updateReady
    || pwaStatus.controlled !== nextStatus.controlled
    || pwaStatus.error !== nextStatus.error;
  pwaStatus = nextStatus;

  if (
    statusRenderScheduled
    || (!onlineChanged && !(router.currentPath === "/settings" && statusChanged))
  ) {
    return;
  }

  statusRenderScheduled = true;
  queueMicrotask(() => {
    statusRenderScheduled = false;
    router.navigate(router.currentPath, { replace: true, focus: false });
  });
});

registerPwa().catch((error) => {
  appRoot.dataset.pwaRegistration = "failed";
  console.warn("Crazy Rummy service worker registration was unavailable.", error);
});
