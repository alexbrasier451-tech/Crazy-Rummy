import {
  DEFAULT_ROUTE,
  normalizeRoute,
  routeForPath
} from "./route-contract.js";

const ROUTER_STATE_KEY = "crazyRummyRoute";

function routeHash(path) {
  return `#${path}`;
}

export function createRouter({
  window: browserWindow = globalThis.window,
  onRouteChange = () => {},
  fallbackPath = DEFAULT_ROUTE
} = {}) {
  if (!browserWindow?.location || !browserWindow?.history) {
    throw new TypeError("createRouter requires a window with location and history");
  }

  const safeFallback = normalizeRoute(fallbackPath);
  const backHandlers = [];
  const backLayers = [];
  let started = false;
  let suppressNextLayerPop = false;
  let currentPath = normalizeRoute(browserWindow.location.hash);
  let currentDepth = Number.isInteger(browserWindow.history.state?.[ROUTER_STATE_KEY])
    ? browserWindow.history.state[ROUTER_STATE_KEY]
    : 0;

  function announce(path, { focus = true } = {}) {
    currentPath = normalizeRoute(path);
    onRouteChange(routeForPath(currentPath), { focus });
  }

  function replace(path, depth = currentDepth, { focus = true } = {}) {
    const nextPath = normalizeRoute(path);
    currentDepth = Math.max(0, depth);
    browserWindow.history.replaceState(
      { ...(browserWindow.history.state ?? {}), [ROUTER_STATE_KEY]: currentDepth },
      "",
      routeHash(nextPath)
    );
    announce(nextPath, { focus });
  }

  function navigate(path, { replace: shouldReplace = false, focus = true } = {}) {
    const nextPath = normalizeRoute(path);

    if (backLayers.length > 0) {
      backLayers.splice(0).forEach((layer) => {
        layer.active = false;
      });
      browserWindow.history.replaceState(
        { [ROUTER_STATE_KEY]: currentDepth },
        "",
        routeHash(nextPath)
      );
      announce(nextPath, { focus });
      return;
    }

    if (shouldReplace) {
      replace(nextPath, currentDepth, { focus });
      return;
    }

    if (nextPath === currentPath) {
      announce(nextPath, { focus });
      return;
    }

    currentDepth += 1;
    browserWindow.history.pushState(
      { [ROUTER_STATE_KEY]: currentDepth },
      "",
      routeHash(nextPath)
    );
    announce(nextPath, { focus });
  }

  function onHistoryChange() {
    const nextPath = normalizeRoute(browserWindow.location.hash);
    const stateDepth = browserWindow.history.state?.[ROUTER_STATE_KEY];

    if (suppressNextLayerPop) {
      suppressNextLayerPop = false;
      currentDepth = Number.isInteger(stateDepth) ? Math.max(0, stateDepth) : 0;
      return;
    }

    const layer = backLayers.at(-1);
    if (layer && Number.isInteger(stateDepth) && stateDepth < layer.depth) {
      backLayers.pop();
      layer.active = false;
      currentDepth = Math.max(0, stateDepth);
      layer.onBack();
      return;
    }

    if (!Number.isInteger(stateDepth)) {
      replace(nextPath, 0);
      return;
    }

    currentDepth = Math.max(0, stateDepth);
    announce(nextPath);
  }

  function back() {
    if (backLayers.at(-1)?.active) {
      browserWindow.history.back();
      return "handled";
    }

    const handler = backHandlers.at(-1);
    if (handler?.()) {
      return "handled";
    }

    if (currentDepth > 0) {
      browserWindow.history.back();
      return "history";
    }

    if (currentPath !== safeFallback) {
      replace(safeFallback, 0);
    }
    return "fallback";
  }

  function addBackHandler(handler) {
    if (typeof handler !== "function") {
      throw new TypeError("Back handler must be a function");
    }
    backHandlers.push(handler);
    return () => {
      const index = backHandlers.lastIndexOf(handler);
      if (index >= 0) backHandlers.splice(index, 1);
    };
  }

  function addBackLayer(onBack) {
    if (typeof onBack !== "function") {
      throw new TypeError("Back layer requires a function");
    }

    currentDepth += 1;
    const layer = {
      active: true,
      depth: currentDepth,
      onBack
    };
    backLayers.push(layer);
    browserWindow.history.pushState(
      { [ROUTER_STATE_KEY]: currentDepth },
      "",
      routeHash(currentPath)
    );

    return () => {
      if (!layer.active) return;
      layer.active = false;
      const index = backLayers.lastIndexOf(layer);
      if (index >= 0) backLayers.splice(index, 1);

      if (browserWindow.history.state?.[ROUTER_STATE_KEY] === layer.depth) {
        suppressNextLayerPop = true;
        browserWindow.history.back();
      }
    };
  }

  function start() {
    if (started) return;
    started = true;
    browserWindow.addEventListener("popstate", onHistoryChange);
    const rawPath = String(browserWindow.location.hash ?? "").replace(/^#/, "") || "/";
    const normalizedPath = normalizeRoute(browserWindow.location.hash);
    const hasRouterState = Number.isInteger(
      browserWindow.history.state?.[ROUTER_STATE_KEY]
    );

    if (rawPath !== normalizedPath || !hasRouterState) {
      replace(normalizedPath, hasRouterState ? currentDepth : 0, { focus: false });
    } else {
      announce(normalizedPath, { focus: false });
    }
  }

  function stop() {
    if (!started) return;
    browserWindow.removeEventListener("popstate", onHistoryChange);
    started = false;
  }

  return Object.freeze({
    start,
    stop,
    navigate,
    back,
    addBackHandler,
    addBackLayer,
    get currentPath() {
      return currentPath;
    }
  });
}
