import assert from "node:assert/strict";
import test, { after, before } from "node:test";

import * as components from "../../src/components/index.js";

class FakeNode {
  constructor(tagName = "#text", text = "") {
    this.tagName = tagName.toUpperCase();
    this.nodeType = tagName === "#text" ? 3 : 1;
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.textContent = text;
    this.hidden = false;
    this.disabled = false;
    this.className = "";
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  dispatch(name, event = {}) {
    this.listeners.get(name)?.({ target: this, preventDefault() {}, ...event });
  }

  focus() {
    fakeDocument.activeElement = this;
  }

  remove() {
    this.removed = true;
  }

  showModal() {
    this.setAttribute("open", "");
  }

  close(value) {
    this.returnValue = value;
    this.removeAttribute("open");
  }
}

const fakeDocument = {
  activeElement: null,
  createElement(tagName) {
    return new FakeNode(tagName);
  },
  createTextNode(text) {
    return new FakeNode("#text", text);
  }
};

function walk(node) {
  return [node, ...node.children.flatMap(walk)];
}

function byClass(root, className) {
  return walk(root).find((node) => node.className.split(" ").includes(className));
}

before(() => {
  globalThis.document = fakeDocument;
});

after(() => {
  delete globalThis.document;
});

test("the public component barrel exports the Phase 1 contract", () => {
  assert.deepEqual(Object.keys(components).sort(), [
    "ACCEPTED_FEEDBACK_ACTIONS",
    "MOTION_DEFAULTS",
    "acceptedFeedbackMetadata",
    "actionButton",
    "actionLink",
    "cardBack",
    "confirmation",
    "connectionState",
    "createAcceptedFeedbackCoordinator",
    "createScreenShell",
    "handTray",
    "hapticsAvailable",
    "modalSheet",
    "motionPrimitive",
    "normalizedMotionPreference",
    "playerChip",
    "playingCard",
    "reducedMotionRequested",
    "routeLine",
    "scoreStrip",
    "toast"
  ]);
});

test("actions use native interactive elements and labelled pending state", () => {
  const button = components.actionButton({ label: "Create table", pending: true });
  const link = components.actionLink({ label: "Rules", href: "#/rules" });
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.disabled, true);
  assert.equal(button.getAttribute("aria-busy"), "true");
  assert.equal(link.tagName, "A");
  assert.equal(link.getAttribute("href"), "#/rules");
});

test("screen shells create a labelled main landmark without parsing HTML", () => {
  const unsafeLooking = "<img src=x onerror=alert(1)>";
  const shell = components.createScreenShell({
    context: "Online play",
    title: unsafeLooking,
    content: [unsafeLooking]
  });
  assert.equal(shell.tagName, "MAIN");
  assert.ok(shell.getAttribute("aria-labelledby"));
  assert.equal(byClass(shell, "screen-shell__title").textContent, unsafeLooking);
  assert.equal(byClass(shell, "screen-shell__content").children[0].nodeType, 3);
});

test("playing cards expose suit, wild, position, and selection beyond colour", () => {
  let selection;
  const card = components.playingCard({
    rank: "Q",
    suit: "spades",
    wild: true,
    position: 4,
    total: 11,
    onToggle: (value) => {
      selection = value;
    }
  });
  assert.equal(card.tagName, "BUTTON");
  assert.match(card.getAttribute("aria-label"), /Queen of spades, wild, not selected, card 4 of 11/);
  assert.equal(byClass(card, "playing-card__wild").textContent, "WILD");
  card.dispatch("click");
  assert.equal(card.getAttribute("aria-pressed"), "true");
  assert.match(card.getAttribute("aria-label"), /selected/);
  assert.equal(selection, true);
});

test("hand trays assign current accessible positions to card data", () => {
  const tray = components.handTray({
    cards: [
      { rank: "A", suit: "clubs" },
      { rank: "10", suit: "hearts" }
    ]
  });
  const cards = walk(tray).filter((node) => node.className.split(" ").includes("playing-card"));
  assert.equal(cards.length, 2);
  assert.match(cards[1].getAttribute("aria-label"), /card 2 of 2/);
});

test("connection, player, score, and route states pair labels with visual data", () => {
  const connection = components.connectionState({
    state: "offline",
    detail: "Showing results from 19:42",
    announce: true
  });
  const player = components.playerChip({
    name: "Sam",
    state: "reconnecting",
    current: true,
    cardCount: 8
  });
  const scores = components.scoreStrip({
    scores: [{ id: "sam", name: "Sam", hand: 12, total: 42 }],
    activePlayerId: "sam"
  });
  const route = components.routeLine({ current: 4 });
  assert.equal(connection.getAttribute("role"), "status");
  assert.equal(connection.getAttribute("aria-live"), "polite");
  assert.match(player.getAttribute("aria-label"), /current turn, Reconnecting, 8 cards/);
  assert.match(
    walk(scores).find((node) => node.tagName === "LI").getAttribute("aria-label"),
    /42 points, Hand \+12, current/
  );
  assert.equal(route.getAttribute("aria-label"), "Hand 4 of 13");
  assert.equal(walk(route).filter((node) => node.tagName === "LI").length, 13);
});

test("modal sheets restore focus and confirmations use explicit destructive actions", () => {
  const trigger = new FakeNode("button");
  trigger.focus();
  const sheet = components.modalSheet({ title: "Rules", content: ["Safe text"] });
  sheet.openSheet();
  assert.equal(sheet.getAttribute("open"), "");
  assert.equal(fakeDocument.activeElement.getAttribute("aria-label"), "Close");
  sheet.closeSheet();
  assert.equal(fakeDocument.activeElement, trigger);

  const confirmation = components.confirmation({
    title: "Leave match?",
    message: "The match may end.",
    destructive: true
  });
  assert.ok(byClass(confirmation, "action--danger"));
});

test("motion is caller-triggered, validates kinds, and honours reduced motion", async () => {
  const target = new FakeNode("div");
  let options;
  target.animate = (_frames, receivedOptions) => {
    options = receivedOptions;
    return { finished: Promise.resolve(), cancel() {} };
  };
  globalThis.matchMedia = () => ({ matches: true });
  const motion = components.motionPrimitive(target, {
    kind: "travel",
    fromX: 80,
    duration: 300
  });
  assert.equal(target.getAttribute("data-motion"), "travel");
  assert.equal(options, undefined);
  await motion.play();
  assert.equal(options.duration, 80);
  assert.throws(
    () => components.motionPrimitive(target, { kind: "network-pending" }),
    /Unknown motion primitive/
  );
  delete globalThis.matchMedia;
});

test("motion preference can explicitly reduce motion even when the system does not", async () => {
  const target = new FakeNode("div");
  let options;
  target.animate = (_frames, receivedOptions) => {
    options = receivedOptions;
    return { finished: Promise.resolve(), cancel() {} };
  };
  globalThis.matchMedia = () => ({ matches: false });
  const motion = components.motionPrimitive(target, {
    kind: "deal",
    duration: 260,
    preference: "Reduced"
  });
  await motion.play();
  assert.equal(options.duration, 80);
  assert.equal(components.normalizedMotionPreference("anything else"), "System");
  assert.equal(components.reducedMotionRequested("Reduced"), true);
  delete globalThis.matchMedia;
});

test("accepted feedback is action-specific, cancellable, and silent before authority accepts", async () => {
  const target = new FakeNode("div");
  let resolveAnimation;
  let cancelledAnimations = 0;
  target.animate = () => ({
    finished: new Promise((resolve) => { resolveAnimation = resolve; }),
    cancel() { cancelledAnimations += 1; resolveAnimation?.(); }
  });
  const vibrations = [];
  const coordinator = components.createAcceptedFeedbackCoordinator({
    navigatorLike: { vibrate: (pattern) => { vibrations.push(pattern); return true; } }
  });

  const pending = await coordinator.play({ action: "discard", outcome: "pending", target });
  assert.deepEqual(pending, {
    action: "discard",
    outcome: "pending",
    played: false,
    reason: "outcome-not-accepted",
    haptic: false
  });
  assert.deepEqual(vibrations, []);

  const first = coordinator.play({ action: "discard", target });
  const second = coordinator.play({ action: "draw", target });
  resolveAnimation();
  const firstResult = await first;
  const secondResult = await second;
  assert.equal(firstResult.cancelled, true);
  assert.equal(secondResult.played, true);
  assert.equal(secondResult.motionKind, "travel");
  assert.ok(cancelledAnimations >= 1);
  assert.deepEqual(vibrations, [[12]]);
});

test("accepted feedback respects haptic preference, exposes every supported action, and never needs audio", async () => {
  assert.deepEqual(components.ACCEPTED_FEEDBACK_ACTIONS, [
    "selection", "deal", "draw", "discard", "meld", "layoff", "wild-replacement", "sort",
    "hand-complete", "match-complete", "reconnect"
  ]);
  assert.deepEqual(components.acceptedFeedbackMetadata("selection").hapticPattern, [8]);
  assert.equal(components.acceptedFeedbackMetadata("sort").motionKind, "reflow");
  assert.deepEqual(components.acceptedFeedbackMetadata("sort").properties, ["transform", "opacity"]);
  assert.equal(components.hapticsAvailable("Off", { vibrate() {} }), false);
  assert.equal(components.hapticsAvailable("On", {}), false);
  assert.throws(
    () => components.acceptedFeedbackMetadata("pending"),
    /Unknown accepted feedback action/
  );

  const target = new FakeNode("div");
  target.animate = () => ({ finished: Promise.resolve(), cancel() {} });
  const vibrations = [];
  const coordinator = components.createAcceptedFeedbackCoordinator({
    hapticsPreference: "Off",
    navigatorLike: { vibrate: (pattern) => { vibrations.push(pattern); return true; } }
  });
  const result = await coordinator.play({ action: "hand-complete", target });
  assert.equal(result.haptic, false);
  assert.deepEqual(vibrations, []);
});
