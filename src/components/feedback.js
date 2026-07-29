import { motionPrimitive } from "./motion.js";

export const ACCEPTED_FEEDBACK_ACTIONS = Object.freeze([
  "selection",
  "deal",
  "draw",
  "discard",
  "meld",
  "layoff",
  "wild-replacement",
  "sort",
  "hand-complete",
  "match-complete",
  "reconnect"
]);

const SAFE_MOTION_PROPERTIES = Object.freeze(["transform", "opacity"]);

function feedbackMetadata(motionKind, duration, hapticPattern = null) {
  return Object.freeze({
    motionKind,
    duration,
    properties: SAFE_MOTION_PROPERTIES,
    hapticPattern: hapticPattern ? Object.freeze([...hapticPattern]) : null
  });
}

const ACTION_METADATA = Object.freeze({
  selection: feedbackMetadata("settle", 120, [8]),
  deal: feedbackMetadata("deal", 260),
  draw: feedbackMetadata("travel", 280),
  discard: feedbackMetadata("travel", 280, [12]),
  meld: feedbackMetadata("travel", 280),
  layoff: feedbackMetadata("travel", 280),
  "wild-replacement": feedbackMetadata("travel", 280),
  sort: feedbackMetadata("reflow", 220),
  "hand-complete": feedbackMetadata("settle", 180, [18, 36, 18]),
  "match-complete": feedbackMetadata("settle", 180, [18, 36, 18]),
  reconnect: feedbackMetadata("settle", 180, [12])
});

function normalizedHapticsPreference(preference = "On") {
  return String(preference).trim().toLowerCase() === "off" ? "Off" : "On";
}

function acceptedOutcome(outcome) {
  return String(outcome ?? "accepted").trim().toLowerCase() === "accepted";
}

function assertKnownAction(action) {
  if (!Object.hasOwn(ACTION_METADATA, action)) {
    throw new TypeError(`Unknown accepted feedback action: ${action ?? ""}`);
  }
}

/**
 * Returns whether haptic feedback can be used on this device. It deliberately
 * does not infer permission from audio APIs: feedback remains optional and
 * silent when vibration is unsupported or explicitly disabled.
 */
export function hapticsAvailable(preference = "On", navigatorLike = globalThis.navigator) {
  return normalizedHapticsPreference(preference) === "On"
    && typeof navigatorLike?.vibrate === "function";
}

export function acceptedFeedbackMetadata(action) {
  assertKnownAction(action);
  return ACTION_METADATA[action];
}

/**
 * Owns one acknowledged feedback run at a time. Callers pass an authoritative
 * accepted outcome plus the final rendered target; pending, rejected, and
 * uncertain outcomes are intentionally silent and motion-free.
 */
export function createAcceptedFeedbackCoordinator({
  motionPreference = "System",
  hapticsPreference = "On",
  navigatorLike = globalThis.navigator
} = {}) {
  let active = null;

  const cancel = () => {
    if (!active) return false;
    active.cancel();
    active = null;
    return true;
  };

  const play = ({
    action,
    outcome = "accepted",
    target = null,
    fromX = 0,
    fromY = 0,
    duration,
    motionPreference: nextMotionPreference = motionPreference,
    hapticsPreference: nextHapticsPreference = hapticsPreference
  } = {}) => {
    assertKnownAction(action);
    if (!acceptedOutcome(outcome)) {
      return Promise.resolve(Object.freeze({
        action,
        outcome: String(outcome ?? ""),
        played: false,
        reason: "outcome-not-accepted",
        haptic: false
      }));
    }

    cancel();
    const metadata = ACTION_METADATA[action];
    let haptic = false;
    if (metadata.hapticPattern && hapticsAvailable(nextHapticsPreference, navigatorLike)) {
      try {
        haptic = navigatorLike.vibrate(metadata.hapticPattern) !== false;
      } catch {
        haptic = false;
      }
    }

    if (!target) {
      return Promise.resolve(Object.freeze({
        action,
        outcome: "accepted",
        played: false,
        reason: "missing-target",
        haptic
      }));
    }

    const primitive = motionPrimitive(target, {
      kind: metadata.motionKind,
      fromX,
      fromY,
      duration: duration ?? metadata.duration,
      preference: nextMotionPreference
    });
    let cancelled = false;
    const run = {
      cancel() {
        cancelled = true;
        primitive.cancel();
      }
    };
    active = run;

    return primitive.play().then(() => Object.freeze({
      action,
      outcome: "accepted",
      played: !cancelled,
      cancelled,
      haptic,
      motionKind: metadata.motionKind
    })).finally(() => {
      if (active === run) active = null;
    });
  };

  return Object.freeze({ play, cancel });
}
