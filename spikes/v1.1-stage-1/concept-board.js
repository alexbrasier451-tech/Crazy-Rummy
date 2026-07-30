import { CONCEPTS, FIXTURE, NETWORK_BY_STATE } from "./fixtures.js";
import { renderConcept } from "./concepts.js";

const VALID = Object.freeze({
  concept: new Set(["a", "b", "c"]),
  screen: new Set(["lobby", "game"]),
  state: new Set(["healthy", "offline", "busy-six"]),
  motion: new Set(["full", "reduced"]),
  colour: new Set(["normal", "forced"])
});

const defaults = Object.freeze({ concept: "b", screen: "game", state: "busy-six", motion: "full", colour: "normal", capture: "review" });
const root = document.querySelector("#stage-one-board");

function readState(search = globalThis.location.search) {
  const params = new URLSearchParams(search);
  return Object.freeze(Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const value = params.get(key);
    if (key === "capture") return [key, value === "keyframe" ? "keyframe" : fallback];
    return [key, VALID[key].has(value) ? value : fallback];
  })));
}

function create(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === "className") node.className = value;
    else if (name === "text") node.textContent = value;
    else node.setAttribute(name, String(value));
  }
  for (const child of children.flat()) if (child) node.append(child);
  return node;
}

function selector(name, choices, value) {
  const label = create("label", { className: "board-control" }, [create("span", { text: name })]);
  const select = create("select", { name, "data-board-control": name });
  for (const [optionValue, labelText] of choices) {
    select.append(create("option", { value: optionValue, text: labelText, selected: optionValue === value ? "selected" : undefined }));
  }
  label.append(select);
  return label;
}

function controls(state) {
  const form = create("form", { className: "board-controls", "aria-label": "Concept board controls" });
  form.append(
    selector("concept", [["a", "A · Night Timetable"], ["b", "B · Compartment Table"], ["c", "C · Route Atlas"]], state.concept),
    selector("screen", [["lobby", "Lobby"], ["game", "Live game"]], state.screen),
    selector("state", [["healthy", "Healthy"], ["offline", "Offline"], ["busy-six", "Busy six-player"]], state.state),
    selector("motion", [["full", "Full motion concept"], ["reduced", "Reduced motion"]], state.motion),
    selector("colour", [["normal", "Normal colour"], ["forced", "Forced-colour representation"]], state.colour)
  );
  form.addEventListener("change", () => {
    const params = new URLSearchParams(globalThis.location.search);
    for (const control of form.querySelectorAll("select")) params.set(control.name, control.value);
    globalThis.history.replaceState(null, "", `${globalThis.location.pathname}?${params}`);
    render();
  });
  return form;
}

function fixturePlate(state, network) {
  const selectionStatus = state.concept === "b"
    ? "OWNER-APPROVED DIRECTION"
    : "NON-SELECTED ALTERNATIVE";
  if (state.capture === "keyframe") {
    const captureRows = [
      `${selectionStatus} · CONCEPT ONLY · NOT SIGNED BETA BASELINE`,
      `${FIXTURE.id} · ${FIXTURE.revision} · ${FIXTURE.date}`,
      `${globalThis.innerWidth} × ${globalThis.innerHeight} · ${state.concept.toUpperCase()} · ${state.screen === "game" ? FIXTURE.route : "/lobby"} / ${state.state} · ${FIXTURE.playerCount} players · ${FIXTURE.localPlayer} (${FIXTURE.localSeatId})`,
      `${network.label} · ${state.motion} / ${state.colour} · Mock: ${FIXTURE.localPlayer} hand only; opponent cards, room data and access credentials omitted.`
    ];
    return create("aside", {
      className: "fixture-plate fixture-plate--capture", "aria-label": "Compact fixture provenance and data boundary",
      "data-stage1-fixture-plate": "true"
    }, captureRows.map((text, index) => create("p", { text, "data-capture-plate-line": String(index + 1) })));
  }
  const rows = [
    ["Status", "CONCEPT ONLY — NOT RUNTIME UI"],
    ["Fixture", `${FIXTURE.id} · ${FIXTURE.revision} · ${FIXTURE.date}`],
    ["Source status", FIXTURE.sourceStatus],
    ["Viewport", `${globalThis.innerWidth} × ${globalThis.innerHeight} CSS px`],
    ["Concept", `${state.concept.toUpperCase()} · ${CONCEPTS[state.concept].name}`],
    ["Selection", selectionStatus],
    ["Route / state", `${state.screen === "game" ? FIXTURE.route : "/lobby"} / ${state.state}`],
    ["Players / local seat", `${FIXTURE.playerCount} players · ${FIXTURE.localPlayer} (${FIXTURE.localSeatId})`],
    ["Network", network.label],
    ["Motion / colour", `${state.motion} / ${state.colour}`],
    ["Data boundary", FIXTURE.mockDataNotice]
  ];
  return create("aside", {
    className: "fixture-plate", "aria-label": "Fixture provenance and data boundary",
    "data-stage1-fixture-plate": "true"
  }, [create("dl", {}, rows.map(([term, detail]) => [create("dt", { text: term }), create("dd", { text: detail })]))]);
}

function render() {
  const state = readState();
  const network = NETWORK_BY_STATE[state.state];
  root.replaceChildren();
  root.dataset.concept = state.concept;
  root.dataset.screen = state.screen;
  root.dataset.state = state.state;
  root.dataset.motion = state.motion;
  root.dataset.colour = state.colour;
  root.dataset.capture = state.capture;
  root.dataset.playerCount = String(FIXTURE.playerCount);
  root.dataset.localSeat = FIXTURE.localSeatId;
  root.dataset.network = network.tone;

  const boardHeader = create("header", { className: "board-header" }, [
    create("p", { className: "board-kicker", text: "Crazy Rummy v1.1 · Stage 1.1.1" }),
    create("h1", { text: CONCEPTS[state.concept].name }),
    create("p", { text: CONCEPTS[state.concept].summary })
  ]);
  const scene = create("section", { className: "board-scene", "data-board-screen": state.screen }, [renderConcept({ ...state, network })]);
  root.append(boardHeader, controls(state), fixturePlate(state, network), scene);
}

globalThis.__stage1Board = Object.freeze({
  fixture: FIXTURE,
  concepts: CONCEPTS,
  getState: () => readState(),
  render,
  setState(next = {}) {
    const current = readState();
    const params = new URLSearchParams();
    for (const [key, fallback] of Object.entries(defaults)) {
      const value = next[key] ?? current[key] ?? fallback;
      params.set(key, key === "capture"
        ? (value === "keyframe" ? "keyframe" : "review")
        : (VALID[key].has(value) ? value : fallback));
    }
    globalThis.history.replaceState(null, "", `${globalThis.location.pathname}?${params}`);
    render();
    return readState();
  }
});

globalThis.addEventListener("resize", render);
render();
