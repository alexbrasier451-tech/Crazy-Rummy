import assert from "node:assert/strict";
import test from "node:test";

import { createRouter } from "../../src/app/router.js";

function fakeWindow(initialHash = "#/") {
  const listeners = new Map();
  const entries = [{ hash: initialHash, state: null }];
  let index = 0;

  const window = {
    location: {
      get hash() {
        return entries[index].hash;
      }
    },
    history: {
      get state() {
        return entries[index].state;
      },
      pushState(state, _title, hash) {
        entries.splice(index + 1);
        entries.push({ hash, state });
        index += 1;
      },
      replaceState(state, _title, hash) {
        entries[index] = { hash, state };
      },
      back() {
        if (index === 0) return;
        index -= 1;
        listeners.get("popstate")?.();
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };

  return window;
}

test("startup canonicalizes an unknown hash to the safe lobby", () => {
  const window = fakeWindow("#/not-a-screen");
  const visited = [];
  const router = createRouter({
    window,
    onRouteChange: ({ path }) => visited.push(path)
  });

  router.start();

  assert.equal(window.location.hash, "#/lobby");
  assert.equal(router.currentPath, "/lobby");
  assert.deepEqual(visited, ["/lobby"]);
});

test("navigation traverses known routes and browser back stays in-app", () => {
  const window = fakeWindow("#/lobby");
  const visited = [];
  const router = createRouter({
    window,
    onRouteChange: ({ path }) => visited.push(path)
  });

  router.start();
  router.navigate("/rules");
  router.navigate("/settings");
  assert.equal(router.currentPath, "/settings");

  assert.equal(router.back(), "history");
  assert.equal(router.currentPath, "/rules");
  assert.equal(window.location.hash, "#/rules");
  assert.deepEqual(visited, ["/lobby", "/rules", "/settings", "/rules"]);
});

test("back from a direct deep link recovers to lobby instead of leaving the app", () => {
  const window = fakeWindow("#/game");
  const router = createRouter({ window });

  router.start();

  assert.equal(router.back(), "fallback");
  assert.equal(window.location.hash, "#/lobby");
  assert.equal(router.currentPath, "/lobby");
});

test("the latest screen-level back handler runs before route history", () => {
  const window = fakeWindow("#/lobby");
  const router = createRouter({ window });
  let closed = false;

  router.start();
  router.navigate("/game");
  const removeHandler = router.addBackHandler(() => {
    closed = true;
    return true;
  });

  assert.equal(router.back(), "handled");
  assert.equal(closed, true);
  assert.equal(router.currentPath, "/game");

  removeHandler();
  assert.equal(router.back(), "history");
  assert.equal(router.currentPath, "/lobby");
});

test("a history-backed layer closes before leaving its route", () => {
  const window = fakeWindow("#/lobby");
  const router = createRouter({ window });
  let closed = false;

  router.start();
  router.addBackLayer(() => {
    closed = true;
  });

  assert.equal(router.back(), "handled");
  assert.equal(closed, true);
  assert.equal(router.currentPath, "/lobby");
  assert.equal(window.location.hash, "#/lobby");
});

test("navigating from a history-backed layer consumes the guard entry", () => {
  const window = fakeWindow("#/lobby");
  const router = createRouter({ window });

  router.start();
  router.addBackLayer(() => {});
  router.navigate("/rules");

  assert.equal(router.currentPath, "/rules");
  assert.equal(router.back(), "history");
  assert.equal(router.currentPath, "/lobby");
});
