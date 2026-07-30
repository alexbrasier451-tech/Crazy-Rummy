import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMAND_TYPE,
  HAND_SCHEDULE,
  LIFECYCLE,
  PHASE,
  assertStateInvariants
} from "../../src/engine/index.js";
import { SYNC_MESSAGE, SYNC_STATUS } from "../../src/online/index.js";
import { PEER_STATE } from "../../src/online/transport/index.js";
import {
  STAGE6_SEATS,
  createOnlineMatchFixture
} from "../support/online-match-fixture.mjs";

function assertConverged(fixture, message = "all seats must converge") {
  for (const [seatId, projection] of Object.entries(fixture.assertableConvergence())) {
    assert.deepEqual(
      projection.publicProjection,
      projection.expectedPublicProjection,
      `${message}: public projection for ${seatId}`
    );
    assert.deepEqual(
      projection.ownHandCardIds,
      projection.expectedOwnHandCardIds,
      `${message}: private hand for ${seatId}`
    );
  }
}

function queuedEventFor(network, seatId, sequence) {
  const playerId = STAGE6_SEATS.find((seat) => seat.seatId === seatId).playerId;
  return (message) => message.destinationPlayerId === playerId
    && message.payload?.type === SYNC_MESSAGE.EVENT
    && message.payload.payload?.authoritativeSequence === sequence;
}

test("three-seat authority keeps actions pending until delivery and fails illegal or malformed input closed", async (t) => {
  const fixture = createOnlineMatchFixture();
  t.after(() => fixture.dispose());
  await fixture.start();
  assertConverged(fixture, "initial snapshots");

  const initial = fixture.authoritativeState();
  for (const { seatId } of STAGE6_SEATS) {
    const own = initial.hand.handsBySeat[seatId];
    const viewWire = JSON.stringify(fixture.sessions[seatId].getSnapshot().view);
    assert.deepEqual(fixture.sessions[seatId].getSnapshot().view.hand.ownHandCardIds, own);
    for (const other of STAGE6_SEATS.filter((seat) => seat.seatId !== seatId)) {
      for (const cardId of initial.hand.handsBySeat[other.seatId]) {
        assert.equal(viewWire.includes(cardId), false, `${seatId} must not receive ${other.seatId}'s ${cardId}`);
      }
    }
  }

  const revisionBeforeIllegal = initial.revision;
  fixture.submit("c", COMMAND_TYPE.DRAW_STOCK, {
    clientCommandId: "stage6-illegal-out-of-turn"
  });
  assert.equal(fixture.authoritativeState().revision, revisionBeforeIllegal);
  assert.equal(fixture.sessions.c.getSnapshot().lastAction.phase, "REJECTED");

  fixture.network.inject("player-c", "player-a", {
    type: "not-a-sync-envelope",
    payload: { handsBySeat: { c: ["forged-card"] } }
  });
  const malformed = fixture.network.deliverAt(0);
  assert.ok(
    ["INVALID_ENVELOPE", "UNSUPPORTED_SCHEMA"].includes(malformed.result.reason),
    `malformed input must fail closed, received ${malformed.result.reason}`
  );
  assert.equal(fixture.authoritativeState().revision, revisionBeforeIllegal);

  const dealerCard = initial.hand.handsBySeat.b[0];
  const queued = fixture.submit("b", COMMAND_TYPE.DEALER_INITIAL_DISCARD, {
    clientCommandId: "stage6-pending-opening",
    cardId: dealerCard
  }, { flush: false });
  assert.equal(queued.queued, true);
  assert.equal(fixture.sessions.b.getSnapshot().lastAction.phase, "PENDING");
  assert.equal(fixture.authoritativeState().revision, revisionBeforeIllegal);

  assert.equal(fixture.network.duplicateWhere((message) =>
    message.fromPlayerId === "player-b"
    && message.payload?.type === SYNC_MESSAGE.COMMAND
  ), true);
  fixture.network.flush();
  assert.equal(fixture.authoritativeState().revision, revisionBeforeIllegal + 1);
  assert.equal(fixture.sessions.b.getSnapshot().lastAction.phase, "ACCEPTED");
  assertConverged(fixture, "duplicate opening command");
});

test("a recovered peer link automatically pauses authority and rebinds the guest", async (t) => {
  const fixture = createOnlineMatchFixture();
  t.after(() => fixture.dispose());
  await fixture.start();

  fixture.network.endpoint("player-a")._setState(PEER_STATE.DISCONNECTED, {
    "player-b": PEER_STATE.DISCONNECTED,
    "player-c": PEER_STATE.CONNECTED
  });
  fixture.network.endpoint("player-b")._setState(PEER_STATE.DISCONNECTED, {
    "player-a": PEER_STATE.DISCONNECTED
  });

  assert.equal(fixture.hostSync.getStatus().state, SYNC_STATUS.PAUSED);
  assert.deepEqual(fixture.hostSync.getStatus().disconnectedSeatIds, ["b"]);
  assert.equal(fixture.clientSyncs.b.getStatus().state, SYNC_STATUS.RECONNECTING);
  assert.equal(fixture.sessions.a.getSnapshot().network.state, SYNC_STATUS.PAUSED);
  assert.equal(fixture.sessions.b.getSnapshot().network.state, SYNC_STATUS.RECONNECTING);

  fixture.network.endpoint("player-a")._setState(PEER_STATE.CONNECTED);
  fixture.network.endpoint("player-b")._setState(PEER_STATE.CONNECTED);
  fixture.network.flush();

  assert.equal(fixture.hostSync.getStatus().state, SYNC_STATUS.RUNNING);
  assert.equal(fixture.clientSyncs.b.getStatus().state, SYNC_STATUS.RUNNING);
  assertConverged(fixture, "automatic transport rebind");
});

test("a foregrounded guest recovers when only the host observed the interruption", async (t) => {
  const visibility = createVisibilityHarness();
  const fixture = createOnlineMatchFixture({ visibilityBySeat: { b: visibility } });
  t.after(() => fixture.dispose());
  await fixture.start();

  fixture.network.endpoint("player-a")._setState(PEER_STATE.DISCONNECTED, {
    "player-b": PEER_STATE.DISCONNECTED,
    "player-c": PEER_STATE.CONNECTED
  });

  assert.equal(fixture.hostSync.getStatus().state, SYNC_STATUS.PAUSED);
  assert.equal(fixture.clientSyncs.b.getStatus().state, SYNC_STATUS.RUNNING);
  assert.equal(fixture.network.endpoint("player-b").getSnapshot().state, PEER_STATE.CONNECTED);

  await visibility.show();
  fixture.network.endpoint("player-a")._setState(PEER_STATE.CONNECTED);
  fixture.network.flush();

  assert.equal(fixture.network.endpoint("player-b")._resumeCount(), 1);
  assert.equal(fixture.hostSync.getStatus().state, SYNC_STATUS.RUNNING);
  assert.equal(fixture.clientSyncs.b.getStatus().state, SYNC_STATUS.RUNNING);
  assertConverged(fixture, "one-sided foreground recovery");
});

test("a thirteen-hand online match converges through delay, reorder, loss, duplication, and rebind", async (t) => {
  const fixture = createOnlineMatchFixture();
  t.after(() => fixture.dispose());
  await fixture.start();
  let commandNumber = 0;

  function submit(seatId, type, fields = {}, options) {
    commandNumber += 1;
    return fixture.submit(seatId, type, {
      clientCommandId: `stage6-full-${commandNumber}`,
      ...fields
    }, options);
  }

  // Duplicate the first command before either copy reaches authority.
  let state = fixture.authoritativeState();
  submit("b", COMMAND_TYPE.DEALER_INITIAL_DISCARD, {
    cardId: state.hand.handsBySeat.b[0]
  }, { flush: false });
  assert.equal(fixture.network.duplicateWhere((message) =>
    message.payload?.type === SYNC_MESSAGE.COMMAND
  ), true);
  fixture.network.flush();
  assert.equal(fixture.authoritativeState().revision, 2);

  // Deliver sequence 4 before sequence 3 to seat c. Its bounded event buffer
  // and resync request must drain once the delayed event arrives.
  state = fixture.authoritativeState();
  submit("c", COMMAND_TYPE.DRAW_STOCK, {}, { flush: false });
  fixture.network.deliverWhere((message) => message.payload?.type === SYNC_MESSAGE.COMMAND);
  const sequenceThree = fixture.network.dropWhere(queuedEventFor(fixture.network, "c", 3));
  assert.ok(sequenceThree, "sequence 3 for c should be delayable");
  const resultThree = fixture.network.dropWhere((message) =>
    message.destinationPlayerId === "player-c"
    && message.payload?.type === SYNC_MESSAGE.COMMAND_RESULT
  );
  assert.ok(resultThree, "sequence 3 command result should be delayable");
  fixture.network.flush();

  state = fixture.authoritativeState();
  submit("c", COMMAND_TYPE.FINISH_TABLE_PLAY, {}, { flush: false });
  fixture.network.deliverWhere((message) => message.payload?.type === SYNC_MESSAGE.COMMAND);
  const deliveredFuture = fixture.network.deliverWhere(queuedEventFor(fixture.network, "c", 4));
  assert.equal(deliveredFuture.result.gap, true);
  fixture.network.inject(
    sequenceThree.fromPlayerId,
    sequenceThree.destinationPlayerId,
    sequenceThree.payload
  );
  fixture.network.inject(
    resultThree.fromPlayerId,
    resultThree.destinationPlayerId,
    resultThree.payload
  );
  fixture.network.flush();
  assert.equal(fixture.sessions.c.getSnapshot().status.authoritativeSequence, 4);

  // Lose sequence 5 for b. Sequence 6 exposes the gap and retained host
  // history repairs it through RESYNC_REQUEST.
  state = fixture.authoritativeState();
  submit("c", COMMAND_TYPE.DISCARD, {
    cardId: state.hand.drawnCardId
  }, { flush: false });
  fixture.network.deliverWhere((message) => message.payload?.type === SYNC_MESSAGE.COMMAND);
  assert.ok(fixture.network.dropWhere(queuedEventFor(fixture.network, "b", 5)));
  fixture.network.flush();

  state = fixture.authoritativeState();
  assert.equal(state.hand.activeSeatId, "a");
  submit("a", COMMAND_TYPE.DRAW_STOCK);
  assert.equal(fixture.sessions.b.getSnapshot().status.authoritativeSequence, 6);
  assertConverged(fixture, "lost event recovery");

  // Exercise the explicit five-minute rebind seam without waiting for wall
  // time. Authority pauses, authenticates c, catches up, and resumes.
  assert.equal(fixture.hostSync.disconnectSeat("c").ok, true);
  assert.equal(fixture.hostSync.getStatus().state, SYNC_STATUS.PAUSED);
  await fixture.sessions.c.reconnect();
  fixture.network.flush();
  assert.equal(fixture.hostSync.getStatus().state, SYNC_STATUS.RUNNING);
  assertConverged(fixture, "seat rebind");

  while (fixture.authoritativeState().lifecycle !== LIFECYCLE.COMPLETE) {
    state = fixture.authoritativeState();
    const hand = state.hand;
    switch (hand.phase) {
      case PHASE.DEALER_INITIAL_DISCARD:
        submit(hand.dealerSeatId, COMMAND_TYPE.DEALER_INITIAL_DISCARD, {
          cardId: hand.handsBySeat[hand.dealerSeatId][0]
        });
        break;
      case PHASE.AWAITING_DRAW:
        submit(hand.activeSeatId, COMMAND_TYPE.DRAW_STOCK);
        break;
      case PHASE.TABLE_PLAY:
        submit(hand.activeSeatId, COMMAND_TYPE.DISCARD, {
          cardId: hand.drawnCardId
        });
        break;
      case PHASE.AWAITING_DISCARD:
        submit(hand.activeSeatId, COMMAND_TYPE.DISCARD, {
          cardId: hand.drawnCardId
        });
        break;
      case PHASE.HAND_COMPLETE:
        for (const seatId of state.seatOrder) {
          if (!fixture.authoritativeState().hand.result.acknowledgedBySeatIds.includes(seatId)) {
            submit(seatId, COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT);
          }
        }
        break;
      default:
        assert.fail(`Unsupported full-match phase ${hand.phase}`);
    }
    assertConverged(fixture, `revision ${fixture.authoritativeState().revision}`);
  }

  state = fixture.authoritativeState();
  assert.equal(state.completedHands.length, HAND_SCHEDULE.length);
  assert.equal(state.currentHandIndex, HAND_SCHEDULE.length);
  assert.ok(state.winners.length >= 1);
  assertStateInvariants(state);
  assertConverged(fixture, "final standings");
  assert.equal(
    fixture.recoveryStorage.wasRemoved(state.gameId),
    true,
    "normal completion must clear the private active-match recovery record"
  );
});

function createVisibilityHarness() {
  const listeners = new Set();
  let visible = false;
  return {
    isVisible: () => visible,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async show() {
      visible = true;
      await Promise.all([...listeners].map((listener) => listener()));
    }
  };
}
