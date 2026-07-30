import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { APP_VERSION } from "../../src/config.js";

const root = path.resolve(import.meta.dirname, "../..");

test("the promoted beta exposes one semantic application version", async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8")
  );
  assert.equal(APP_VERSION, "1.0.0");
  assert.equal(packageJson.version, APP_VERSION);
});
