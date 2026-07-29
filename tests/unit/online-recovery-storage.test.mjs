import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryStorage } from "../../src/local/index.js";
import {
  ACTIVE_MATCH_KEY,
  MATCH_RECOVERY_PREFIX,
  createMatchRecoveryStorage
} from "../../src/online/recovery-storage.js";

test("explicit device clearing removes every private match recovery record", () => {
  const storage = createMemoryStorage();
  const recovery = createMatchRecoveryStorage({ storage });
  recovery.writeComposition("match-active", { private: "active" });
  recovery.write("match-other", { private: "other" });

  recovery.clearAll();

  assert.equal(storage.getItem(ACTIVE_MATCH_KEY), null);
  assert.equal(storage.getItem(`${MATCH_RECOVERY_PREFIX}match-active`), null);
  assert.equal(storage.getItem(`${MATCH_RECOVERY_PREFIX}match-other`), null);
});
