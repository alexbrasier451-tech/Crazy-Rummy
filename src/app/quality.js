function reducedDataRequested(navigatorLike = globalThis.navigator, matchMediaLike = globalThis.matchMedia) {
  const connection = navigatorLike?.connection
    ?? navigatorLike?.mozConnection
    ?? navigatorLike?.webkitConnection;
  return connection?.saveData === true
    || Boolean(matchMediaLike?.("(prefers-reduced-data: reduce)")?.matches);
}

export function presentationQuality({
  navigatorLike = globalThis.navigator,
  matchMediaLike = globalThis.matchMedia,
  explicit = null
} = {}) {
  if (String(explicit).toLowerCase() === "degraded") return "degraded";
  if (String(explicit).toLowerCase() === "full") return "full";
  return reducedDataRequested(navigatorLike, matchMediaLike) ? "degraded" : "full";
}

export function applyPresentationQuality(
  options = {},
  root = globalThis.document?.documentElement
) {
  const quality = presentationQuality(options);
  if (root?.dataset) root.dataset.quality = quality;
  return quality;
}
