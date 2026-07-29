const listeners = new Set();
const APP_BASE_URL = (() => {
  const configured = import.meta.env?.BASE_URL ?? "/";
  const withLeadingSlash = configured.startsWith("/")
    ? configured
    : `/${configured}`;
  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash
    : `${withLeadingSlash}/`;
})();

let registrationPromise;
let lifecycleWatched = false;
let currentStatus = Object.freeze({
  supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
  phase: "idle",
  updateReady: false,
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  controlled: typeof navigator !== "undefined"
    && Boolean(navigator.serviceWorker?.controller),
  error: null
});

function publish(patch) {
  currentStatus = Object.freeze({ ...currentStatus, ...patch });
  for (const listener of listeners) {
    listener(currentStatus);
  }
}

function watchInstallingWorker(registration) {
  const worker = registration.installing;
  if (!worker) return;

  worker.addEventListener("statechange", () => {
    if (worker.state !== "installed") return;

    if (navigator.serviceWorker.controller) {
      publish({
        phase: "update-ready",
        updateReady: true,
        controlled: true
      });
    } else {
      publish({ phase: "ready", updateReady: false });
    }
  });
}

export function getPwaStatus() {
  return currentStatus;
}

export function subscribePwaStatus(listener) {
  if (typeof listener !== "function") {
    throw new TypeError("PWA status listener must be a function.");
  }

  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

export async function registerPwa({
  serviceWorkerUrl = `${APP_BASE_URL}sw.js`,
  scope = APP_BASE_URL
} = {}) {
  if (!currentStatus.supported) {
    publish({ phase: "unsupported" });
    return null;
  }

  if (registrationPromise) return registrationPromise;

  if (!lifecycleWatched) {
    lifecycleWatched = true;
    window.addEventListener("online", () => publish({ online: true }));
    window.addEventListener("offline", () => publish({ online: false }));
  }

  publish({ phase: "registering", error: null });
  registrationPromise = navigator.serviceWorker.register(serviceWorkerUrl, {
    scope,
    updateViaCache: "none"
  }).then((registration) => {
    registration.addEventListener("updatefound", () => {
      publish({ phase: "installing", updateReady: false });
      watchInstallingWorker(registration);
    });

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      publish({
        phase: "ready",
        controlled: Boolean(navigator.serviceWorker.controller),
        updateReady: false
      });
    });

    if (registration.waiting) {
      publish({
        phase: "update-ready",
        updateReady: true,
        controlled: Boolean(navigator.serviceWorker.controller)
      });
    } else {
      publish({
        phase: "ready",
        updateReady: false,
        controlled: Boolean(navigator.serviceWorker.controller)
      });
    }

    return registration;
  }).catch((error) => {
    registrationPromise = undefined;
    publish({
      phase: "error",
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  });

  return registrationPromise;
}

export async function checkForPwaUpdate() {
  const registration = await registerPwa();
  if (!registration) return null;
  await registration.update();
  return registration;
}

export async function activatePwaUpdate() {
  const registration = await registerPwa();
  if (!registration?.waiting) return false;

  publish({ phase: "activating" });
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}
