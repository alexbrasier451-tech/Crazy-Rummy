export const ROUTES = Object.freeze([
  { id: "startup", path: "/", label: "Startup", context: "Crazy Rummy" },
  { id: "identity", path: "/identity", label: "Your seat", context: "First launch" },
  { id: "lobby", path: "/lobby", label: "Lobby", context: "Online play" },
  { id: "waiting-room", path: "/waiting-room", label: "Waiting room", context: "Night Train" },
  { id: "game", path: "/game", label: "Game table", context: "Local gameplay harness" },
  { id: "hand-result", path: "/hand-result", label: "Hand result", context: "Accepted hand result" },
  { id: "final-result", path: "/final-result", label: "Final result", context: "Journey complete" },
  { id: "rules", path: "/rules", label: "Rules", context: "Rules v1" },
  { id: "settings", path: "/settings", label: "Settings", context: "Your device" }
]);

export const DEFAULT_ROUTE = "/lobby";

export function normalizeRoute(hash) {
  const raw = String(hash ?? "").replace(/^#/, "").split("?")[0] || "/";
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return ROUTES.some((route) => route.path === path) ? path : DEFAULT_ROUTE;
}

export function routeForPath(path) {
  return ROUTES.find((route) => route.path === path)
    ?? ROUTES.find((route) => route.path === DEFAULT_ROUTE);
}
