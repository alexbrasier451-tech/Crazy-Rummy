import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ROUTE,
  ROUTES,
  normalizeRoute,
  routeForPath
} from "../../src/app/route-contract.js";

test("the Phase 1 screen map has stable unique paths", () => {
  const paths = ROUTES.map(({ path }) => path);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(paths, [
    "/",
    "/identity",
    "/lobby",
    "/waiting-room",
    "/game",
    "/hand-result",
    "/final-result",
    "/rules",
    "/settings"
  ]);
});

test("unknown hashes recover to the safe lobby route", () => {
  assert.equal(normalizeRoute("#/missing"), DEFAULT_ROUTE);
  assert.equal(routeForPath("/missing").path, DEFAULT_ROUTE);
});

test("query values do not affect route matching", () => {
  assert.equal(normalizeRoute("#/game?state=offline"), "/game");
});
