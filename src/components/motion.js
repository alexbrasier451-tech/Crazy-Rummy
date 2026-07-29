export const MOTION_DEFAULTS = Object.freeze({
  deal: 260,
  travel: 280,
  settle: 180,
  flip: 240,
  reflow: 220
});

let motionSequence = 0;

export function normalizedMotionPreference(preference = "System") {
  return String(preference).trim().toLowerCase() === "reduced" ? "Reduced" : "System";
}

export function reducedMotionRequested(preference = "System") {
  return normalizedMotionPreference(preference) === "Reduced"
    || Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

function framesFor(kind, fromX, fromY, reduced) {
  if (reduced) {
    return [{ opacity: 0.82 }, { opacity: 1 }];
  }

  if (kind === "flip") {
    return [
      { transform: "perspective(36rem) rotateY(-90deg)", opacity: 0.7 },
      { transform: "perspective(36rem) rotateY(0deg)", opacity: 1 }
    ];
  }
  if (kind === "settle") {
    return [
      { transform: "scale(0.96)", opacity: 0.88 },
      { transform: "scale(1.025)", opacity: 1, offset: 0.72 },
      { transform: "scale(1)", opacity: 1 }
    ];
  }

  return [
    {
      transform: `translate3d(${Number(fromX) || 0}px, ${Number(fromY) || 0}px, 0)`,
      opacity: kind === "deal" ? 0.25 : 0.72
    },
    { transform: "translate3d(0, 0, 0)", opacity: 1 }
  ];
}

export function motionPrimitive(
  target,
  { kind = "settle", fromX = 0, fromY = 0, duration, preference = "System" } = {}
) {
  if (!target || typeof target.setAttribute !== "function") {
    throw new TypeError("motionPrimitive requires a DOM element.");
  }
  if (!Object.hasOwn(MOTION_DEFAULTS, kind)) {
    throw new TypeError(`Unknown motion primitive: ${kind}`);
  }

  let animation = null;
  let fallbackTimer = null;
  let fallbackResolve = null;
  let activeToken = null;
  target.setAttribute("data-motion", kind);

  const clearActiveAttribute = (token = activeToken) => {
    if (token && target.getAttribute("data-motion-active") === token) {
      target.removeAttribute("data-motion-active");
    }
  };

  const cancel = () => {
    const token = activeToken;
    animation?.cancel?.();
    animation = null;
    if (fallbackTimer !== null) {
      globalThis.clearTimeout(fallbackTimer);
      fallbackTimer = null;
      const resolve = fallbackResolve;
      fallbackResolve = null;
      resolve?.();
    }
    clearActiveAttribute(token);
    if (activeToken === token) activeToken = null;
  };

  const play = () => {
    cancel();
    const token = `motion-${++motionSequence}`;
    activeToken = token;
    const reduced = reducedMotionRequested(preference);
    const resolvedDuration = reduced
      ? Math.min(Number(duration) || 80, 80)
      : (Number(duration) || MOTION_DEFAULTS[kind]);
    const frames = framesFor(kind, fromX, fromY, reduced);
    target.setAttribute("data-motion-active", token);

    if (typeof target.animate === "function") {
      animation = target.animate(frames, {
        duration: resolvedDuration,
        easing: "cubic-bezier(0.2, 0.78, 0.25, 1)",
        fill: "none"
      });
      return Promise.resolve(animation.finished)
        .catch(() => undefined)
        .finally(() => {
          clearActiveAttribute(token);
          if (activeToken === token) activeToken = null;
        });
    }

    return new Promise((resolve) => {
      fallbackResolve = resolve;
      fallbackTimer = globalThis.setTimeout(() => {
        fallbackTimer = null;
        fallbackResolve = null;
        clearActiveAttribute(token);
        if (activeToken === token) activeToken = null;
        resolve();
      }, resolvedDuration);
    });
  };

  return Object.freeze({ play, cancel });
}
