import {
  actionButton,
  ACCEPTED_FEEDBACK_ACTIONS,
  cardBack,
  connectionState,
  createAcceptedFeedbackCoordinator,
  handTray,
  playingCard,
  playerChip,
  routeLine,
  scoreStrip
} from "../components/index.js";
import { normalizePreferences } from "../app/preferences.js";
import { inferMeldType } from "../engine/index.js";
import {
  RANKS,
  SUITS,
  buildLayoffSlots,
  buildMeldCandidate,
  cardDisplayName,
  cardParts,
  phaseCopy,
  rejectionCopy,
  representedLabel,
  sortCardIds
} from "../game-ui/presenters.js";
import { copy, element, heading, screenWithMenu, stack } from "./helpers.js";
import { onlineActionCopy, onlineGameState } from "./online-game.js";

function commandButton(label, onActivate, { variant = "secondary", disabled = false, name } = {}) {
  const button = actionButton({ label, variant, disabled, onActivate });
  if (name) button.dataset.gameControl = name;
  return button;
}

function cardNode(cardId, { wildRank, selected = false, interactive = false, onToggle, position, total } = {}) {
  const card = cardParts(cardId);
  if (!card) return element("span", { className: "game-card-error", text: "Unknown card" });
  const node = playingCard({
    ...card,
    wild: card.rank === wildRank,
    selected,
    interactive,
    onToggle,
    position,
    total
  });
  node.dataset.cardId = cardId;
  return node;
}

function selectedCardIds(cards, selected) {
  return cards.filter((cardId) => selected.has(cardId));
}

function nameForSeat(view, seatId) {
  return view?.seats?.[seatId]?.displayName ?? seatId ?? "A player";
}

function representationFor(cardId, representations) {
  return representations[cardId] ?? {};
}

function representationFields({ cardId, type, value, onChange, labelPrefix = "Wild represents" }) {
  const rankId = `representation-${cardId.replace(/[^a-z0-9]/gi, "-")}-rank`;
  const suitId = `representation-${cardId.replace(/[^a-z0-9]/gi, "-")}-suit`;
  const rank = element("select", {
    id: rankId,
    value: value.rank ?? "",
    "aria-label": `${labelPrefix} rank for ${cardDisplayName(cardId)}`,
    onChange: (event) => onChange({ ...value, rank: event.target.value })
  },
  element("option", { value: "", text: "Choose rank" }),
  ...RANKS.map((item) => element("option", { value: item, text: item })));
  const fields = [
    element("label", { htmlFor: rankId, text: `${labelPrefix}: rank` }),
    rank
  ];
  if (type === "RUN") {
    const suit = element("select", {
      id: suitId,
      value: value.suit ?? "",
      "aria-label": `${labelPrefix} suit for ${cardDisplayName(cardId)}`,
      onChange: (event) => onChange({ ...value, suit: event.target.value })
    },
    element("option", { value: "", text: "Choose suit" }),
    ...SUITS.map((item) => element("option", { value: item, text: item })));
    fields.push(element("label", { htmlFor: suitId, text: `${labelPrefix}: suit` }), suit);
  }
  return element("div", { className: "game-representation", dataset: { cardId } }, ...fields);
}

function validateRepresentations(cardIds, wildRank, representations, type) {
  for (const cardId of cardIds) {
    if (cardParts(cardId)?.rank !== wildRank) continue;
    const representation = representations[cardId];
    if (!representation?.rank || (type === "RUN" && !representation.suit)) {
      return `Choose the represented ${type === "RUN" ? "rank and suit" : "rank"} for ${cardDisplayName(cardId)}.`;
    }
  }
  return null;
}

function meldInferenceProblem(cardIds, wildRank, representations, inference) {
  if (cardIds.length < 3) return "Select at least three cards to make a meld.";

  const wildCards = cardIds.filter((cardId) => cardParts(cardId)?.rank === wildRank);
  const missingRank = wildCards.find((cardId) => !representations[cardId]?.rank);
  if (missingRank) {
    return `Choose the represented rank for ${cardDisplayName(missingRank)}.`;
  }

  if (inference.ok) return validateRepresentations(
    cardIds,
    wildRank,
    representations,
    inference.type
  );

  const missingSuit = wildCards.find((cardId) => !representations[cardId]?.suit);
  if (missingSuit) {
    return `If these cards form a run, choose the represented suit for ${cardDisplayName(missingSuit)}.`;
  }
  return "Those cards do not form one complete legal set or run.";
}

function stateSnapshot(session) {
  const snapshot = session?.getSnapshot?.();
  return snapshot && typeof snapshot === "object" ? snapshot : {};
}

function sessionView(snapshot) {
  return snapshot.view ?? snapshot.playerView ?? null;
}

const ACCEPTED_FEEDBACK_ACTION_SET = new Set(ACCEPTED_FEEDBACK_ACTIONS);

function feedbackActionForCommand(type) {
  return {
    DEALER_INITIAL_DISCARD: "discard",
    DRAW_STOCK: "draw",
    DRAW_DISCARD: "draw",
    CREATE_MELD: "meld",
    LAY_OFF: "layoff",
    REPLACE_WILD: "wild-replacement",
    DISCARD: "discard",
    ACKNOWLEDGE_HAND_RESULT: "deal"
  }[type] ?? null;
}

function meldSummary(meld, view) {
  const kind = meld.type === "RUN" ? "Run" : "Set";
  const cards = (meld.slots ?? []).map((slot) => {
    const represented = representedLabel(slot.represented);
    return represented
      ? `${cardDisplayName(slot.cardId)} as ${represented}`
      : cardDisplayName(slot.cardId);
  });
  return `${kind} by ${nameForSeat(view, meld.originatingSeatId)}: ${cards.join(", ")}.`;
}

function meldCard(slot, wildRank) {
  const parts = cardParts(slot.cardId);
  return element("span", {
    className: `game-meld-card${parts?.suit === "diamonds" || parts?.suit === "hearts" ? " game-meld-card--red" : ""}`,
    text: parts ? `${parts.rank} ${parts.symbol}` : "Unknown card",
    dataset: {
      cardId: slot.cardId,
      wild: String(parts?.rank === wildRank),
      represented: representedLabel(slot.represented)
    },
    "aria-hidden": "true"
  });
}

/**
 * Shared local/online workspace. It only renders the authenticated view
 * supplied by the session boundary; opponent cards are never read from `state`
 * as a fallback. Online actions remain staged until host authority confirms
 * their command ID.
 */
export function gameScreen({ navigate, router, localSession, onlineGameSession, onReturnToLobby }) {
  const isOnline = Boolean(onlineGameSession);
  const session = onlineGameSession ?? localSession;
  const initialPreferences = normalizePreferences(localSession?.getSnapshot?.().preferences);
  const feedback = createAcceptedFeedbackCoordinator({
    motionPreference: initialPreferences.motion === "Reduced" ? "Reduced" : "System",
    hapticsPreference: initialPreferences.haptics ? "On" : "Off"
  });
  const ui = {
    selected: new Set(),
    sort: initialPreferences.handSort,
    sheet: null,
    composer: { order: [], representations: {} },
    layoff: { meldId: null, placement: "END", representations: {} },
    replace: { meldId: null, wildCardId: null },
    discardConfirm: false,
    pending: false,
    message: "",
    messageTone: "status",
    acceptedFeedback: { action: "deal" },
    queuedActions: new Map(),
    handledLastActions: new Set(),
    previousNetworkMode: null,
    networkAnnouncements: new Set(),
    showDetails: false
  };

  const workspace = element("div", {
    className: "game-workspace",
    dataset: { gameWorkspace: isOnline ? "online" : "local" }
  });
  const shell = screenWithMenu({
    id: "game",
    context: isOnline ? "Online match" : "Local integration harness",
    title: "Game table",
    router,
    content: [workspace],
    menuContent: [
      commandButton("Return to lobby", () => {
        if (
          isOnline
          && globalThis.confirm?.(
            "Leave this live match? This device will stop playing and clear its active private recovery record."
          ) !== true
        ) return;
        if (typeof onReturnToLobby === "function") void onReturnToLobby();
        else navigate("/lobby");
      }, { variant: "quiet", name: "return-lobby" })
    ]
  });
  const disposeMenu = shell.disposeScreen;
  let unsubscribe = () => {};
  let activeSheet = null;
  let closeSheetBackLayer = () => {};
  let countdownTimer = null;
  const liveAnnouncer = element("p", {
    className: "visually-hidden",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true"
  });

  function announce(message, tone = "error") {
    ui.message = message;
    ui.messageTone = tone;
    if (liveAnnouncer.textContent !== message) liveAnnouncer.textContent = message;
  }

  function preferences() {
    return normalizePreferences(localSession?.getSnapshot?.().preferences);
  }

  function queueAcceptedFeedback(type, details = {}) {
    const action = feedbackActionForCommand(type)
      ?? (ACCEPTED_FEEDBACK_ACTION_SET.has(type) ? type : null);
    if (action) ui.acceptedFeedback = { action, ...details };
  }

  function acceptedFeedbackTarget(queued) {
    const { action } = queued;
    if (action === "selection" && queued.cardId) {
      return [...workspace.querySelectorAll("[data-private-hand] [data-card-id]")]
        .find((node) => node.dataset.cardId === queued.cardId);
    }
    if (action === "draw" || action === "deal" || action === "sort") {
      return workspace.querySelector(".hand-tray__list");
    }
    if (action === "discard") {
      return workspace.querySelector(".stock-discard > :last-child .playing-card")
        ?? workspace.querySelector(".stock-discard");
    }
    if (["meld", "layoff", "wild-replacement"].includes(action)) {
      return workspace.querySelector(".game-meld-list");
    }
    return workspace.querySelector(".route-line") ?? workspace;
  }

  function playQueuedFeedback() {
    const queued = ui.acceptedFeedback;
    if (!queued) return;
    ui.acceptedFeedback = null;
    const devicePreferences = preferences();
    void feedback.play({
      action: queued.action,
      outcome: "accepted",
      target: acceptedFeedbackTarget(queued),
      motionPreference: devicePreferences.motion === "Reduced" ? "Reduced" : "System",
      hapticsPreference: devicePreferences.haptics ? "On" : "Off"
    });
  }

  function updateNetworkAnnouncement(presentation) {
    if (!presentation) return;
    const previousMode = ui.previousNetworkMode;
    const interrupted = ["reconnecting", "paused"].includes(presentation.mode);
    const wasInterrupted = ["reconnecting", "paused"].includes(previousMode);
    let key = null;
    let message = null;
    if (interrupted && !wasInterrupted) {
      key = `${presentation.mode}:entry`;
      message = `${presentation.label}. ${presentation.countdown?.label ?? presentation.detail}`;
    } else if (
      interrupted
      && presentation.countdown?.seconds <= 60
      && presentation.countdown?.seconds > 0
    ) {
      key = `${presentation.mode}:one-minute`;
      message = `One minute warning. ${presentation.countdown.label}`;
    } else if (presentation.mode === "running" && wasInterrupted) {
      key = "running:recovered";
      message = "Back online. Your table is up to date.";
      queueAcceptedFeedback("reconnect");
    } else if (["abandoned", "forfeit", "incompatible"].includes(presentation.mode)) {
      key = `${presentation.mode}:terminal`;
      message = `${presentation.label}. ${presentation.detail}`;
    }
    if (key && !ui.networkAnnouncements.has(key)) {
      ui.networkAnnouncements.add(key);
      announce(message, presentation.mode === "running" ? "success" : "status");
    }
    ui.previousNetworkMode = presentation.mode;
  }

  function updateCountdownTimer(presentation) {
    const needsTimer = Boolean(presentation?.countdown);
    if (needsTimer && countdownTimer === null) {
      countdownTimer = globalThis.setInterval(() => render(), 1000);
    } else if (!needsTimer && countdownTimer !== null) {
      globalThis.clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function gameplayIsBlocked() {
    return ui.pending || ui.onlineBlocked || ui.queuedActions.size > 0;
  }

  function current() {
    const snapshot = stateSnapshot(session);
    const view = sessionView(snapshot);
    return { snapshot, view, hand: view?.hand ?? null, localSeatId: snapshot.localSeatId ?? session?.localSeatId ?? null };
  }

  async function execute(type, payload = {}, { onAccepted } = {}) {
    const { snapshot } = current();
    if (ui.pending || (isOnline && (onlineGameState(snapshot).disabled || ui.queuedActions.size))) return;
    const submit = isOnline ? session?.submit : session?.execute;
    if (!submit) {
      announce(isOnline
        ? "The online game session is not available yet."
        : "The local game session is not available yet.");
      render();
      return;
    }
    ui.pending = true;
    render();
    try {
      const result = await submit.call(session, type, payload);
      if (isOnline) {
        if (result?.queued === true && result.commandId) {
          ui.queuedActions.set(result.commandId, { type, onAccepted });
          const feedback = onlineActionCopy({ phase: "pending" });
          announce(feedback.message, feedback.tone);
          reconcileLastAction(current().snapshot);
        } else {
          announce(`${rejectionCopy(result?.reason, result?.detail)} Nothing changed; your staged choices are still here.`);
        }
        return;
      }
      if (result?.accepted === false) {
        announce(rejectionCopy(result.reason, result.detail));
      } else if (result?.accepted === true && !result.duplicate) {
        queueAcceptedFeedback(type);
        onAccepted?.(result);
        announce(type === "DISCARD" || type === "DEALER_INITIAL_DISCARD"
          ? "Turn complete. The latest table is shown."
          : "Table action accepted.", "success");
        const acceptedHand = result.state?.hand;
        if (result.state?.lifecycle === "COMPLETE") {
          navigate("/final-result");
        } else if (acceptedHand?.phase === "HAND_COMPLETE") {
          navigate("/hand-result");
        }
      } else if (result?.reason) {
        announce(rejectionCopy(result.reason, result.detail));
      }
    } catch (error) {
      announce(error?.message || (isOnline
        ? "The action could not be queued. Nothing changed; your staged choices are still here."
        : "The local table could not check that action."));
    } finally {
      ui.pending = false;
      render();
    }
  }

  function setSelection(cardId, selected) {
    if (selected) ui.selected.add(cardId);
    else ui.selected.delete(cardId);
    ui.discardConfirm = false;
    if (selected) queueAcceptedFeedback("selection", { cardId });
    render();
  }

  function selectedOrAnnounce(cards, message = "Select one or more cards first.") {
    const chosen = selectedCardIds(cards, ui.selected);
    if (!chosen.length) {
      announce(message);
      render();
      return null;
    }
    return chosen;
  }

  function closeSheet() {
    ui.sheet = null;
    ui.discardConfirm = false;
    if (activeSheet) {
      closeSheetBackLayer();
      activeSheet = null;
    }
    ui.sheetReturnFocus?.focus?.({ preventScroll: true });
    render();
  }

  function openSheet(kind) {
    ui.sheetReturnFocus = document.activeElement;
    ui.sheet = kind;
    render();
  }

  function openActionSubsheet(kind) {
    ui.sheet = kind;
    render();
  }

  function navigateForTerminal(view) {
    if (view?.lifecycle === "COMPLETE") {
      navigate("/final-result");
      return true;
    }
    if (view?.hand?.phase === "HAND_COMPLETE") {
      navigate("/hand-result");
      return true;
    }
    return false;
  }

  function reconcileLastAction(snapshot) {
    if (!isOnline) return;
    const action = snapshot?.lastAction;
    const commandId = action?.commandId;
    const phase = String(action?.phase ?? "").toLowerCase();
    if (!commandId || !phase) return;
    const key = [
      commandId,
      phase,
      action.authoritativeSequence ?? "",
      action.reason ?? "",
      action.detail ?? ""
    ].join("|");
    if (ui.handledLastActions.has(key)) return;

    const queued = ui.queuedActions.get(commandId);
    if ((phase === "accepted" || phase === "rejected") && !queued) return;
    ui.handledLastActions.add(key);
    const feedback = onlineActionCopy(action);
    if (phase === "accepted") {
      ui.queuedActions.delete(commandId);
      queueAcceptedFeedback(queued?.type);
      queued?.onAccepted?.(action);
      announce(feedback?.message ?? "The host accepted that action.", "success");
    } else if (phase === "rejected") {
      ui.queuedActions.delete(commandId);
      announce(`${rejectionCopy(action.reason, action.detail)} Nothing changed; your staged choices are still here.`);
    } else if (feedback) {
      announce(feedback.message, feedback.tone);
    }
  }

  function handleSessionChange() {
    const { snapshot, view } = current();
    reconcileLastAction(snapshot);
    if (!navigateForTerminal(view)) render();
  }

  function subscribeToSession() {
    if (!session?.subscribe) return;
    const remove = session.subscribe(handleSessionChange);
    if (typeof remove === "function") unsubscribe = remove;
  }

  function runFullFixture() {
    unsubscribe();
    unsubscribe = () => {};
    try {
      const final = session.runAutomatedMatch();
      navigate(final?.view?.lifecycle === "COMPLETE" ? "/final-result" : "/game");
    } catch (error) {
      announce(error?.message || "The automated fixture could not complete.");
      subscribeToSession();
      render();
    }
  }

  function selectedWildCards(cardIds, wildRank) {
    return cardIds.filter((cardId) => cardParts(cardId)?.rank === wildRank);
  }

  function composerSheet(view, hand, localSeatId, cards) {
    const chosen = ui.composer.order.length ? ui.composer.order : selectedOrAnnounce(cards);
    if (!chosen) return null;
    const preview = buildMeldCandidate({
      id: "meld-preview",
      cardIds: chosen,
      actorSeatId: localSeatId,
      wildRank: hand.wildRank,
      representations: ui.composer.representations
    });
    const inference = inferMeldType(preview, { wildRank: hand.wildRank });
    const type = inference.ok ? inference.type : null;
    const representationProblem = meldInferenceProblem(
      chosen,
      hand.wildRank,
      ui.composer.representations,
      inference
    );
    const displayOrder = inference.ok
      ? inference.meld.slots.map((slot) => slot.cardId)
      : chosen;
    const orderedCards = element(
      "div",
      { className: "meld-group", "aria-label": "Cards in this meld" },
      displayOrder.map((cardId) => cardNode(cardId, {
        wildRank: hand.wildRank,
        interactive: false
      }))
    );
    return gameSheet("Compose meld", "The game detects a set or run from the selected cards. Explicitly assign every wild card.", [
      orderedCards,
      type
        ? element("p", {
          className: "game-meld-detected",
          role: "status",
          text: `${type === "RUN" ? "Run" : "Set"} detected`
        })
        : copy("Meld type will appear when the selected cards and wild identities form one legal meld."),
      ...selectedWildCards(chosen, hand.wildRank).map((cardId) => representationFields({
        cardId,
        type: type ?? "RUN",
        value: representationFor(cardId, ui.composer.representations),
        onChange: (next) => { ui.composer.representations[cardId] = next; render(); }
      })),
      representationProblem ? element("p", { className: "game-inline-error", text: representationProblem }) : copy("Selection is staged locally. It is not on the shared table until accepted."),
      stack(
        commandButton("Place meld", () => {
          const candidate = buildMeldCandidate({
            id: `meld-${Date.now()}`,
            cardIds: chosen,
            actorSeatId: localSeatId,
            wildRank: hand.wildRank,
            representations: ui.composer.representations
          });
          const detected = inferMeldType(candidate, { wildRank: hand.wildRank });
          const issue = meldInferenceProblem(
            chosen,
            hand.wildRank,
            ui.composer.representations,
            detected
          );
          if (issue || !detected.ok) {
            announce(issue ?? "Those cards do not form one complete legal set or run.");
            render();
            return;
          }
          execute("CREATE_MELD", { meld: detected.meld }, {
            onAccepted: () => {
              ui.sheet = null;
              ui.selected.clear();
              ui.composer = { order: [], representations: {} };
            }
          });
        }, {
          variant: "primary",
          disabled: Boolean(representationProblem) || !inference.ok || gameplayIsBlocked(),
          name: "place-meld"
        }),
        commandButton("Cancel composition", closeSheet, { variant: "quiet", name: "cancel-meld" })
      )
    ]);
  }

  function layoffSheet(view, hand, cards) {
    const chosen = selectedOrAnnounce(cards);
    if (!chosen) return null;
    const meld = hand.melds.find((entry) => entry.id === ui.layoff.meldId) ?? hand.melds[0];
    if (!meld) return gameSheet("Add to table", "There are no shared melds to add to.", [commandButton("Close", closeSheet, { variant: "quiet" })]);
    ui.layoff.meldId = meld.id;
    const problem = validateRepresentations(chosen, hand.wildRank, ui.layoff.representations, meld.type);
    return gameSheet("Add to table", "Choose a shared meld and its explicit destination.", [
      element("label", { text: "Destination meld" }),
      element("select", {
        value: meld.id,
        "aria-label": "Destination meld",
        onChange: (event) => { ui.layoff.meldId = event.target.value; render(); }
      }, ...hand.melds.map((entry) => element("option", { value: entry.id, text: `${entry.type.toLowerCase()} · ${entry.id}` }))),
      meld.type === "RUN" ? element("fieldset", { className: "game-choice" },
        element("legend", { text: "Run destination" }),
        choice("Add before", ui.layoff.placement === "START", () => { ui.layoff.placement = "START"; render(); }),
        choice("Add after", ui.layoff.placement === "END", () => { ui.layoff.placement = "END"; render(); })
      ) : copy("Sets accept cards as an atomic addition up to four cards."),
      ...selectedWildCards(chosen, hand.wildRank).map((cardId) => representationFields({
        cardId,
        type: meld.type,
        value: representationFor(cardId, ui.layoff.representations),
        labelPrefix: "Laid-off wild represents",
        onChange: (next) => { ui.layoff.representations[cardId] = next; render(); }
      })),
      problem ? element("p", { className: "game-inline-error", text: problem }) : copy(`Preview: add ${chosen.length} selected card${chosen.length === 1 ? "" : "s"} ${meld.type === "RUN" ? ui.layoff.placement.toLowerCase() : "to this set"}.`),
      stack(
        commandButton("Add selected cards", () => {
          if (problem) { announce(problem); render(); return; }
          execute("LAY_OFF", {
            meldId: meld.id,
            slots: buildLayoffSlots({ meld, cardIds: chosen, wildRank: hand.wildRank, representations: ui.layoff.representations }),
            placement: ui.layoff.placement
          }, {
            onAccepted: () => {
              ui.sheet = null;
              ui.selected.clear();
              ui.layoff.representations = {};
            }
          });
        }, { variant: "primary", disabled: Boolean(problem) || gameplayIsBlocked(), name: "submit-layoff" }),
        commandButton("Cancel add", closeSheet, { variant: "quiet", name: "cancel-layoff" })
      )
    ]);
  }

  function replacementSheet(hand, cards) {
    const naturalCardId = selectedOrAnnounce(cards, "Select the matching natural card from your hand first.")?.[0];
    const entries = hand.melds.flatMap((meld) => meld.slots
      .filter((slot) => cardParts(slot.cardId)?.rank === hand.wildRank)
      .map((slot) => ({ meld, slot })));
    const selectedEntry = entries.find((entry) => entry.meld.id === ui.replace.meldId && entry.slot.cardId === ui.replace.wildCardId) ?? entries[0];
    if (!selectedEntry || !naturalCardId) return gameSheet("Replace a wild", "Select a natural card and a wild card on the shared table.", [commandButton("Close", closeSheet, { variant: "quiet" })]);
    ui.replace.meldId = selectedEntry.meld.id;
    ui.replace.wildCardId = selectedEntry.slot.cardId;
    return gameSheet("Replace wild", "Review both movements before confirming the replacement.", [
      element("label", { text: "Wild card on table" }),
      element("select", {
        value: `${selectedEntry.meld.id}|${selectedEntry.slot.cardId}`,
        "aria-label": "Wild card on table",
        onChange: (event) => {
          const [meldId, wildCardId] = event.target.value.split("|");
          ui.replace = { meldId, wildCardId };
          render();
        }
      }, ...entries.map((entry) => element("option", {
        value: `${entry.meld.id}|${entry.slot.cardId}`,
        text: `${cardDisplayName(entry.slot.cardId)} represents ${representedLabel(entry.slot.represented)}`
      }))),
      copy(`Your ${cardDisplayName(naturalCardId)} replaces the table wild. ${cardDisplayName(selectedEntry.slot.cardId)} returns to your hand.`),
      stack(
        commandButton("Replace wild card", () => {
          execute("REPLACE_WILD", {
            meldId: selectedEntry.meld.id,
            wildCardId: selectedEntry.slot.cardId,
            naturalCardId
          }, {
            onAccepted: () => {
              ui.sheet = null;
              ui.selected.clear();
            }
          });
        }, { variant: "primary", disabled: gameplayIsBlocked(), name: "confirm-wild-replacement" }),
        commandButton("Cancel replacement", closeSheet, { variant: "quiet", name: "cancel-wild-replacement" })
      )
    ]);
  }

  function discardSheet(hand, cards, opening = false) {
    const chosen = selectedCardIds(cards, ui.selected);
    if (!chosen.length) {
      ui.sheet = null;
      return null;
    }
    if (chosen.length !== 1) return gameSheet("Choose one discard", "Select exactly one card before ending this turn.", [commandButton("Back to turn", closeSheet, { variant: "quiet" })]);
    const cardId = chosen[0];
    return gameSheet(opening ? "Opening discard" : "End your turn?", opening
      ? `Discard ${cardDisplayName(cardId)} to start normal play.`
      : `Discard ${cardDisplayName(cardId)}. This ends your turn.`, [
      stack(
        commandButton(opening ? "Confirm opening discard" : "Confirm discard", () => {
          execute(opening ? "DEALER_INITIAL_DISCARD" : "DISCARD", { cardId }, {
            onAccepted: () => {
              ui.sheet = null;
              ui.discardConfirm = false;
              ui.selected.clear();
            }
          });
        }, { variant: "danger", disabled: gameplayIsBlocked(), name: opening ? "confirm-opening-discard" : "confirm-discard" }),
        commandButton("Back to turn", closeSheet, { variant: "quiet", name: "cancel-discard" })
      )
    ]);
  }

  function quickDiscard(cards) {
    const chosen = selectedOrAnnounce(cards, "Select exactly one card to discard.");
    if (!chosen) return;
    if (chosen.length !== 1) {
      announce("Select exactly one card before ending this turn.");
      render();
      return;
    }
    execute("DISCARD", { cardId: chosen[0] }, {
      onAccepted: () => {
        ui.discardConfirm = false;
        ui.selected.clear();
      }
    });
  }

  function actionMenuSheet(view, hand, localSeatId, cards) {
    const mine = hand.activeSeatId === localSeatId;
    const copyForPhase = phaseCopy(hand.phase, mine);
    const selectedCount = selectedCardIds(cards, ui.selected).length;
    const controls = [];
    const runFromMenu = (type, payload = {}, options = {}) => {
      ui.sheet = null;
      void execute(type, payload, options);
    };
    if (!mine) {
      controls.push(copy(
        `No turn action is available on this device. ${nameForSeat(view, hand.activeSeatId)} is taking their turn. `
        + "You can keep Actions open while you review the table or sort your private hand."
      ));
    } else if (copyForPhase.step === "draw") {
      controls.push(
        commandButton("Draw from stock", () => runFromMenu("DRAW_STOCK"), { variant: "primary", disabled: gameplayIsBlocked() || hand.stockCount < 1, name: "draw-stock" }),
        commandButton("Take discard", () => runFromMenu("DRAW_DISCARD"), { disabled: gameplayIsBlocked() || !hand.discardCardIds?.length, name: "draw-discard" })
      );
    } else if (copyForPhase.step === "play") {
      controls.push(
        commandButton("Make a meld", () => {
          const chosen = selectedOrAnnounce(cards);
          if (!chosen) return;
          ui.composer = { order: chosen, representations: {} };
          openActionSubsheet("compose");
        }, { variant: "primary", disabled: gameplayIsBlocked() || selectedCount < 1, name: "open-meld" }),
        commandButton("Add to table", () => {
          if (!selectedOrAnnounce(cards)) return;
          openActionSubsheet("layoff");
        }, { disabled: gameplayIsBlocked() || selectedCount < 1 || !hand.melds.length, name: "add-to-table" }),
        commandButton("Replace a wild", () => {
          if (!selectedOrAnnounce(cards, "Select the natural replacement card first.")) return;
          openActionSubsheet("replace");
        }, { disabled: gameplayIsBlocked() || selectedCount < 1, name: "replace-wild" }),
        commandButton("Finish table play", () => runFromMenu("FINISH_TABLE_PLAY"), { disabled: gameplayIsBlocked(), name: "finish-table-play" })
      );
    } else if (copyForPhase.step === "discard") {
      const opening = hand.phase === "DEALER_INITIAL_DISCARD";
      const quickConfirm = !opening && preferences().confirmDiscard === "Quick confirm";
      controls.push(commandButton(
        opening ? "Choose opening discard" : (quickConfirm ? "Discard selected card" : "Discard…"),
        () => {
          if (quickConfirm) {
            ui.sheet = null;
            quickDiscard(cards);
            return;
          }
          if (!selectedOrAnnounce(cards, "Select exactly one card to discard.")) return;
          openActionSubsheet("discard");
        },
        { variant: "danger", disabled: gameplayIsBlocked() || selectedCount !== 1, name: "discard" }
      ));
    } else if (copyForPhase.step === "complete") {
      controls.push(commandButton("Acknowledge hand result", () => runFromMenu("ACKNOWLEDGE_HAND_RESULT"), { variant: "primary", disabled: gameplayIsBlocked(), name: "acknowledge-hand" }));
    }
    return element("section", {
      id: "game-action-menu",
      className: "game-action-menu",
      role: "region",
      "aria-label": "Actions",
      dataset: { gameActionMenu: "true", gameSheet: "actions" }
    },
    heading("Actions", 2),
    copy(copyForPhase.detail),
      stack(...controls),
      copy(`Selected: ${selectedCount}. Turn: draw → play → discard.`),
      commandButton("Close actions", closeSheet, { variant: "quiet", name: "close-actions" })
    );
  }

  function actionLaunch() {
    const expanded = ui.sheet === "actions";
    const trigger = commandButton(expanded ? "Hide actions" : "Actions", () => {
      if (expanded) closeSheet();
      else openSheet("actions");
    }, {
      variant: "primary",
      disabled: gameplayIsBlocked(),
      name: "open-actions"
    });
    trigger.setAttribute("aria-expanded", String(expanded));
    trigger.setAttribute("aria-controls", "game-action-menu");
    return element("section", { className: "game-action-launch", "aria-label": "Game actions" }, trigger);
  }

  function gameDetails({ developer, hand, activeName }) {
    const detailsId = "game-details";
    const toggle = commandButton(
      ui.showDetails ? "Hide game details" : "Show game details",
      () => { ui.showDetails = !ui.showDetails; render(); },
      { variant: "quiet", name: "toggle-game-details" }
    );
    toggle.setAttribute("aria-expanded", String(ui.showDetails));
    toggle.setAttribute("aria-controls", detailsId);
    const status = element("p", {
      className: `game-live-message game-live-message--${ui.messageTone}`,
      role: "note",
      text: ui.message || `${activeName}'s turn. ${phaseCopy(hand.phase, hand.activeSeatId === current().localSeatId).detail}`
    });
    return element("section", { className: "game-details" },
      toggle,
      ui.showDetails ? element("div", { id: detailsId, className: "game-details__content" },
        developer,
        routeLine({ current: hand.index, total: 13, label: `Hand ${hand.index} of 13`, compact: true }),
        element("p", { className: "game-turn-status", text: `${activeName}'s turn · ${hand.phase.replaceAll("_", " ")}` }),
        status
      ) : null
    );
  }

  function gameSheet(title, description, content) {
    return element("section", {
      className: "game-sheet",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": title,
      dataset: { gameSheet: title.toLowerCase().replaceAll(" ", "-") }
    }, heading(title, 2), copy(description), ...content);
  }

  function choice(label, checked, onChange) {
    const input = element("input", { type: "radio", checked, onChange });
    return element("label", { className: "game-radio" }, input, label);
  }

  function render() {
    const { snapshot, view, hand, localSeatId } = current();
    reconcileLastAction(snapshot);
    const presentationSnapshot = isOnline && ui.queuedActions.size
      ? {
          ...snapshot,
          network: {
            ...snapshot.network,
            pendingCommandIds: [
              ...new Set([
                ...(Array.isArray(snapshot.network?.pendingCommandIds)
                  ? snapshot.network.pendingCommandIds
                  : []),
                ...ui.queuedActions.keys()
              ])
            ]
          }
        }
      : snapshot;
    const networkPresentation = isOnline ? onlineGameState(presentationSnapshot) : null;
    ui.onlineBlocked = Boolean(networkPresentation?.disabled);
    updateNetworkAnnouncement(networkPresentation);
    updateCountdownTimer(networkPresentation);
    workspace.replaceChildren(liveAnnouncer);
    if (!view || !hand) {
      workspace.append(
        networkPresentation ? connectionState({
          state: networkPresentation.connectionState,
          label: networkPresentation.label,
          detail: networkPresentation.detail,
          announce: false
        }) : null,
        element("section", { className: "screen-panel" },
          heading(isOnline ? "Online game unavailable" : "Local game unavailable"),
          copy(isOnline
            ? "Waiting for a safe player view from the online match."
            : "Start the local integration session to render the playable table."),
          !isOnline && session?.reset
            ? commandButton("Reset local match", () => session.reset(), { variant: "primary", name: "reset-local-match" })
            : null
        )
      );
      return;
    }
    const ownCards = Array.isArray(hand.ownHandCardIds) ? hand.ownHandCardIds : [];
    if (!isOnline || !gameplayIsBlocked()) {
      ui.selected = new Set([...ui.selected].filter((cardId) => ownCards.includes(cardId)));
    }
    const cards = sortCardIds(ownCards, ui.sort);
    const revision = view.revision ?? snapshot.state?.revision;
    workspace.className = `game-workspace${isOnline ? " game-workspace--online" : ""}`;
    workspace.dataset.revision = String(revision ?? "");
    workspace.dataset.phase = hand.phase;
    workspace.dataset.activeSeatId = hand.activeSeatId;
    workspace.dataset.networkMode = networkPresentation?.mode ?? "local";
    workspace.setAttribute("aria-busy", String(networkPresentation?.mode === "pending" || ui.pending));
    const activeName = nameForSeat(view, hand.activeSeatId);
    const selected = ui.selected;

    const seatSelect = element("select", {
      value: localSeatId ?? "",
      "aria-label": "Developer local seat",
      onChange: (event) => {
        ui.selected.clear();
        ui.sheet = null;
        session?.setLocalSeat?.(event.target.value);
      }
    }, ...view.seatOrder.map((seatId) => element("option", { value: seatId, text: nameForSeat(view, seatId) })));
    seatSelect.dataset.gameControl = "developer-seat";
    const developer = !isOnline ? element("section", { className: "game-developer", "aria-label": "Local harness controls" },
      element("label", { text: "Developer local seat" }), seatSelect,
      session?.reset ? commandButton("Reset match", () => session.reset(), { variant: "quiet", name: "reset-local-match" }) : null,
      session?.runAutomatedMatch ? commandButton("Run automated match", runFullFixture, { variant: "quiet", name: "run-automated-match" }) : null
    ) : null;

    const players = element("div", { className: "player-list", dataset: { sharedPlayers: "true" } },
      view.seatOrder.map((seatId, index) => playerChip({
        name: nameForSeat(view, seatId),
        marker: seatId === localSeatId
          ? preferences().marker
          : (["◆", "■", "▲", "●", "✦", "✚"][index] ?? "●"),
        state: seatId === hand.activeSeatId ? "ready" : "online",
        current: seatId === hand.activeSeatId,
        cardCount: hand.handCountsBySeat?.[seatId] ?? 0
      }))
    );
    const scoreEntries = view.seatOrder.map((seatId) => ({
      id: seatId,
      name: nameForSeat(view, seatId),
      score: view.seats?.[seatId]?.cumulativeScore ?? 0,
      total: view.seats?.[seatId]?.cumulativeScore ?? 0
    }));
    const tableMelds = element("div", { className: "game-meld-list", "aria-label": "Shared table melds" },
      hand.melds.length ? hand.melds.map((meld) => element("button", {
        type: "button",
        className: "game-meld",
        "aria-label": `${meldSummary(meld, view)} Select as lay-off destination.`,
        dataset: { meldId: meld.id, selected: String(ui.layoff.meldId === meld.id) },
        onClick: () => {
          ui.layoff.meldId = meld.id;
          if (selected.size) openSheet("layoff");
          else render();
        }
      },
      element("strong", { text: `${meld.type.toLowerCase()} · ${nameForSeat(view, meld.originatingSeatId)}` }),
      element("span", { className: "game-meld-summary", text: meldSummary(meld, view) }),
      element("div", { className: "meld-group", "aria-hidden": "true" },
        meld.slots.map((slot) => meldCard(slot, hand.wildRank))))) : copy("No melds are on the shared table yet.")
    );
    const discardCardId = hand.discardCardIds?.at(-1);
    const table = element("section", { className: "screen-panel game-table", "aria-labelledby": "shared-table-title" },
      element("h2", { id: "shared-table-title", text: "Shared table" }),
      players,
      scoreStrip({ label: "Cumulative scores", activePlayerId: hand.activeSeatId, scores: scoreEntries }),
      tableMelds,
      element("div", { className: "stock-discard" },
        element("div", {}, heading(`Stock · ${hand.stockCount}`, 3), cardBack({ label: `Stock pile, ${hand.stockCount} face-down cards` })),
        element("div", {}, heading("Discard pile", 3), discardCardId
          ? cardNode(discardCardId, { wildRank: hand.wildRank, interactive: false })
          : copy("No opening discard yet.")))
    );
    const changeSort = (value) => {
      if (ui.sort === value) return;
      ui.sort = value;
      queueAcceptedFeedback("sort");
      render();
    };
    const sortControls = element("fieldset", { className: "game-sort", "aria-label": "Sort private hand" },
      element("legend", { text: "Sort hand" }),
      ...[["suit", "Suit"], ["rank", "Rank"], ["custom", "Custom"]].map(([value, label]) => choice(label, ui.sort === value, () => changeSort(value)))
    );
    const canSelect = !gameplayIsBlocked()
      && hand.activeSeatId === localSeatId
      && ["DEALER_INITIAL_DISCARD", "TABLE_PLAY", "AWAITING_DISCARD"].includes(hand.phase);
    const tray = handTray({
      label: `Your hand · ${cards.length} cards`,
      cards: cards.map((cardId) => {
        const card = cardParts(cardId);
        return {
          ...card,
          wild: card?.rank === hand.wildRank,
          selected: selected.has(cardId),
          disabled: !canSelect,
          onToggle: (next) => setSelection(cardId, next)
        };
      }),
      sortLabel: `Wild rank: ${hand.wildRank}`
    });
    tray.dataset.privateHand = "true";
    tray.querySelectorAll(".playing-card").forEach((node, index) => { node.dataset.cardId = cards[index]; });
    const handSection = element("section", { className: "game-private-hand", "aria-label": "Your private hand" }, tray, sortControls,
      commandButton("Clear selection", () => { ui.selected.clear(); ui.discardConfirm = false; render(); }, { variant: "quiet", disabled: !selected.size, name: "clear-selection" })
    );
    if (networkPresentation) {
      workspace.append(connectionState({
        state: networkPresentation.connectionState,
        label: networkPresentation.label,
        detail: networkPresentation.detail,
        announce: false
      }));
    }
    workspace.append(
      gameDetails({ developer, hand, activeName }),
      table,
      handSection,
      actionLaunch()
    );
    let sheet;
    if (ui.sheet === "actions") sheet = actionMenuSheet(view, hand, localSeatId, cards);
    if (ui.sheet === "compose") sheet = composerSheet(view, hand, localSeatId, cards);
    if (ui.sheet === "layoff") sheet = layoffSheet(view, hand, cards);
    if (ui.sheet === "replace") sheet = replacementSheet(hand, cards);
    if (ui.sheet === "discard") sheet = discardSheet(hand, cards, hand.phase === "DEALER_INITIAL_DISCARD");
    if (sheet) {
      workspace.append(sheet);
      if (activeSheet !== ui.sheet) {
        closeSheetBackLayer();
        activeSheet = ui.sheet;
        closeSheetBackLayer = router.addBackLayer(() => {
          ui.sheet = null;
          activeSheet = null;
          ui.sheetReturnFocus?.focus?.({ preventScroll: true });
          render();
        });
        queueMicrotask(() => sheet.querySelector("button, select, input")?.focus({ preventScroll: true }));
      }
    } else if (activeSheet) {
      closeSheetBackLayer();
      activeSheet = null;
    }
    queueMicrotask(playQueuedFeedback);
  }

  subscribeToSession();
  render();
  shell.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.sheet) {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key === "Tab" && ui.sheet) {
      const sheet = workspace.querySelector(".game-sheet");
      const focusable = [...(sheet?.querySelectorAll(
        "button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href]"
      ) ?? [])].filter((node) => node.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  shell.disposeScreen = () => {
    unsubscribe();
    if (countdownTimer !== null) globalThis.clearInterval(countdownTimer);
    feedback.cancel();
    closeSheetBackLayer();
    disposeMenu?.();
  };
  return shell;
}
