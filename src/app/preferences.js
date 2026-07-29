const CARD_SIZES = new Set(["Standard", "Large"]);
const HAND_SORTS = new Set(["custom", "suit", "rank"]);
const MOTION_VALUES = new Set(["Follow system", "System", "Reduced"]);
const DISCARD_VALUES = new Set(["Always", "Quick confirm"]);
const MARKERS = new Set(["◆", "●", "■", "▲"]);

export const DEFAULT_PREFERENCES = Object.freeze({
  marker: "●",
  cardSize: "Standard",
  handSort: "rank",
  motion: "Follow system",
  confirmDiscard: "Always",
  highContrast: false,
  autoRefresh: true,
  haptics: false
});

export function normalizePreferences(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const normalizedHandSort = String(source.handSort ?? source.handSorting ?? "").toLowerCase();
  const handSort = HAND_SORTS.has(normalizedHandSort)
    ? normalizedHandSort
    : (HAND_SORTS.has(String(source.handSorting ?? "").toLowerCase())
        ? String(source.handSorting).toLowerCase()
        : DEFAULT_PREFERENCES.handSort);
  return Object.freeze({
    marker: MARKERS.has(source.marker) ? source.marker : DEFAULT_PREFERENCES.marker,
    cardSize: CARD_SIZES.has(source.cardSize)
      ? source.cardSize
      : DEFAULT_PREFERENCES.cardSize,
    handSort,
    motion: MOTION_VALUES.has(source.motion)
      ? source.motion
      : DEFAULT_PREFERENCES.motion,
    confirmDiscard: DISCARD_VALUES.has(source.confirmDiscard)
      ? source.confirmDiscard
      : DEFAULT_PREFERENCES.confirmDiscard,
    highContrast: source.highContrast === true,
    autoRefresh: source.autoRefresh !== false,
    haptics: source.haptics === true
  });
}

export function applyPreferencesToRoot(value, root = globalThis.document?.documentElement) {
  const preferences = normalizePreferences(value);
  if (!root?.dataset) return preferences;
  root.dataset.cardSize = preferences.cardSize.toLowerCase();
  root.dataset.motion = preferences.motion === "Reduced" ? "reduced" : "system";
  root.dataset.contrast = preferences.highContrast ? "high" : "system";
  root.dataset.haptics = preferences.haptics ? "on" : "off";
  return preferences;
}
