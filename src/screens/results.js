import {
  actionButton,
  createAcceptedFeedbackCoordinator,
  routeLine,
  scoreStrip
} from "../components/index.js";
import { normalizePreferences } from "../app/preferences.js";
import { COMMAND_TYPE, LIFECYCLE } from "../engine/index.js";
import { cardDisplayName } from "../game-ui/presenters.js";
import {
  completedSummaryView,
  completionPresentation,
  copySafeResultSummary,
  finalStandingRows,
  handHistoryRows,
  handScoreRows,
  nextHandPreview,
  ownScoreBreakdown
} from "../game-ui/results-presenters.js";
import {
  bulletList,
  copy,
  panel,
  screenWithMenu,
  stack
} from "./helpers.js";

function seatName(snapshot, seatId) {
  return snapshot?.view?.seats?.[seatId]?.displayName
    ?? seatId
    ?? "No player";
}

function resultStatus(text) {
  const status = document.createElement("p");
  status.className = "screen-copy";
  status.dataset.state = "ready";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.textContent = text;
  return status;
}

function returnToLobby(navigate, onReturnToLobby) {
  if (typeof onReturnToLobby === "function") return onReturnToLobby();
  return navigate("/lobby");
}

function unavailableResultScreen({ final = false, navigate, router, online = false, onReturnToLobby }) {
  return screenWithMenu({
    id: final ? "final-result" : "hand-result",
    context: final ? "Journey in progress" : "Hand in progress",
    title: final ? "Final standings are not ready" : "This hand is not complete",
    status: copy(
      online
        ? "The host has not delivered an authoritative result yet."
        : "The local engine has not produced this result yet."
    ),
    content: [
      stack(
        actionButton({
          label: online ? "Return to the online game" : "Return to the local game",
          onActivate: () => navigate("/game")
        }),
        actionButton({
          label: "Return to Lobby",
          variant: "quiet",
          onActivate: () => returnToLobby(navigate, onReturnToLobby)
        })
      )
    ],
    router,
    menuContent: [actionButton({ label: "Return to Lobby", variant: "secondary", onActivate: () => returnToLobby(navigate, onReturnToLobby) })]
  });
}

function nextHandCopy(preview, snapshot) {
  if (!preview) return null;
  const dealer = preview.dealerSeatId ? seatName(snapshot, preview.dealerSeatId) : "the next active player";
  const wild = preview.wildRank ? `${preview.wildRank} wild` : "the scheduled wild rank";
  return `Hand ${preview.handIndex}: ${wild}; ${dealer} deals first.`;
}

function historyCopy(history) {
  return history.map((hand) => {
    const scores = hand.scores.map((score) => `${score.name} +${score.hand}`).join(", ");
    return `Hand ${String(hand.index).padStart(2, "0")} (${hand.wildRank} wild; dealer ${hand.dealerName}): ${hand.outcome}. ${scores}`;
  });
}

function startResultFeedback(shell, localSession, action) {
  const preferences = normalizePreferences(localSession?.getSnapshot?.().preferences);
  const feedback = createAcceptedFeedbackCoordinator({
    motionPreference: preferences.motion === "Reduced" ? "Reduced" : "System",
    hapticsPreference: preferences.haptics ? "On" : "Off"
  });
  queueMicrotask(() => {
    void feedback.play({
      action,
      target: shell.querySelector(".route-line"),
      motionPreference: preferences.motion === "Reduced" ? "Reduced" : "System",
      hapticsPreference: preferences.haptics ? "On" : "Off"
    });
  });
  return () => feedback.cancel();
}

export function handResultScreen({ navigate, router, localSession, onlineGameSession, onReturnToLobby }) {
  const isOnline = Boolean(onlineGameSession);
  const session = onlineGameSession ?? localSession;
  const snapshot = session?.getSnapshot?.();
  const state = snapshot?.view;
  const result = state?.hand?.result;
  if (!result) return unavailableResultScreen({ navigate, router, online: isOnline, onReturnToLobby });

  const handIndex = state.hand.index;
  const winnerName = result.winnerSeatId
    ? seatName(snapshot, result.winnerSeatId)
    : null;
  const acknowledged = new Set(result.acknowledgedBySeatIds ?? []);
  const participatingSeatIds = state.activeSeatOrder ?? state.seatOrder;
  const waiting = participatingSeatIds
    .filter((seatId) => !acknowledged.has(seatId));
  const localSeatId = snapshot.localSeatId;
  const localWaiting = waiting.includes(localSeatId);
  const scoreRows = handScoreRows(state, result, (seatId) => seatName(snapshot, seatId));
  const ownBreakdown = ownScoreBreakdown(result);
  const preview = nextHandPreview(state);
  const status = resultStatus(
    state.lifecycle === LIFECYCLE.COMPLETE
      ? "The final accepted standings are ready."
      : waiting.length === 0
      ? "Every active seat is ready."
      : isOnline
      ? localWaiting
        ? "Acknowledge this result when you are ready to continue."
        : `Waiting for ${waiting.length} other ${waiting.length === 1 ? "player" : "players"} to continue.`
      : `${waiting.length} player${waiting.length === 1 ? "" : "s"} still to continue.`
  );
  let pending = false;

  const continueMatch = async () => {
    if (state.lifecycle === LIFECYCLE.COMPLETE) {
      navigate("/final-result");
      return;
    }
    if (isOnline) {
      if (!localWaiting || pending) return;
      pending = true;
      continueButton.disabled = true;
      status.textContent = "Sending your acknowledgement. The next hand has not started yet.";
      const commandResult = await session.submit(COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT);
      if (!commandResult?.queued && commandResult?.accepted !== true) {
        status.textContent = commandResult?.detail
          ?? `Could not continue: ${commandResult?.reason ?? "the host did not queue the acknowledgement"}.`;
        status.dataset.state = "error";
        pending = false;
        continueButton.disabled = false;
      }
      return;
    }
    for (const seatId of waiting) {
      const commandResult = session.execute({
        type: COMMAND_TYPE.ACKNOWLEDGE_HAND_RESULT,
        actorSeatId: seatId
      });
      if (!commandResult?.accepted) {
        status.textContent = commandResult?.detail
          ?? `Could not continue: ${commandResult?.reason ?? "unknown engine rejection"}.`;
        status.dataset.state = "error";
        return;
      }
    }
    navigate(session.getSnapshot().view.lifecycle === LIFECYCLE.COMPLETE
      ? "/final-result"
      : "/game");
  };
  const continueButton = actionButton({
    label: isOnline
      ? localWaiting ? "Continue to next hand" : "Waiting for other players"
      : handIndex === state.rules.handCount
      ? "View final standings"
      : "Continue to next hand",
    disabled: isOnline && !localWaiting,
    onActivate: continueMatch
  });

  const shell = screenWithMenu({
    id: "hand-result",
    context: `Hand ${String(handIndex).padStart(2, "0")} complete`,
    title: winnerName ? `${winnerName} went out` : "Stock exhausted",
    status,
    content: [
      scoreStrip({
        label: `Accepted scores for hand ${handIndex}`,
        activePlayerId: result.winnerSeatId,
        scores: scoreRows
      }),
      copy("Lower totals are better. The accepted hand score and running total are shown separately."),
      ownBreakdown ? panel(
        "Your remaining-card score",
        ownBreakdown.cards.length
          ? bulletList(ownBreakdown.cards.map((card) => `${cardDisplayName(card.cardId)}: ${card.value}`))
          : copy("No cards remained in your hand. Penalty: 0."),
        copy(`Your hand penalty: ${ownBreakdown.total}.`)
      ) : null,
      routeLine({
        current: handIndex,
        total: state.rules.handCount,
        label: `Hand ${handIndex} of ${state.rules.handCount}`,
        compact: true
      }),
      preview ? panel("Next hand", copy(nextHandCopy(preview, snapshot))) : null,
      panel(
        "Continue the match",
        copy(
          isOnline
            ? "Each active player acknowledges only their own result. The host starts the next hand after everyone is ready."
            : "Everyone at this table continues together before the next hand is dealt."
        ),
        stack(
          continueButton,
          actionButton({
            label: isOnline ? "Leave match and return to Lobby" : "Return to Lobby",
            variant: "secondary",
            onActivate: () => {
              if (
                isOnline
                && globalThis.confirm?.(
                  "Leave this match before the next hand? Your active private recovery record will be cleared."
                ) !== true
              ) return;
              returnToLobby(navigate, onReturnToLobby);
            }
          })
        )
      )
    ],
    router,
    menuContent: [actionButton({ label: "Return to Lobby", variant: "secondary", onActivate: () => returnToLobby(navigate, onReturnToLobby) })]
  });
  const unsubscribe = isOnline
    ? session.subscribe?.((next) => {
      const nextView = next?.view;
      if (nextView?.lifecycle === LIFECYCLE.COMPLETE) {
        navigate("/final-result");
      } else if (nextView?.hand?.phase !== "HAND_COMPLETE") {
        navigate("/game");
      } else if (next?.lastAction?.phase === "REJECTED") {
        status.textContent = next.lastAction.detail
          ?? `Could not continue: ${next.lastAction.reason ?? "the host rejected the acknowledgement"}.`;
        status.dataset.state = "error";
        pending = false;
        continueButton.disabled = false;
      } else if (pending && next?.lastAction?.phase === "ACCEPTED") {
        const nextResult = nextView?.hand?.result;
        const accepted = new Set(nextResult?.acknowledgedBySeatIds ?? []);
        const nextParticipants = nextView?.activeSeatOrder ?? nextView?.seatOrder ?? [];
        if (!accepted.has(next?.localSeatId ?? localSeatId)) return;
        const othersWaiting = nextParticipants.filter((seatId) => !accepted.has(seatId));
        pending = false;
        continueButton.disabled = true;
        continueButton.querySelector(".action__label").textContent = "Acknowledgement accepted";
        status.textContent = othersWaiting.length
          ? `Acknowledgement accepted. Waiting for ${othersWaiting.length} other ${othersWaiting.length === 1 ? "player" : "players"}.`
          : "Acknowledgement accepted. Starting the next hand.";
        status.dataset.state = "ready";
      }
    }) ?? (() => {})
    : () => {};
  const disposeFeedback = startResultFeedback(shell, localSession, "hand-complete");
  shell.disposeScreen = () => {
    unsubscribe();
    disposeFeedback();
  };
  return shell;
}

export function finalResultScreen({
  navigate,
  router,
  localSession,
  onlineGameSession,
  completedSummary,
  onStartNewMatch,
  onReturnToLobby,
  onCopyResultSummary
}) {
  const session = onlineGameSession ?? localSession;
  const liveSnapshot = session?.getSnapshot?.();
  const storedState = completedSummaryView(completedSummary);
  // The unified latest-summary record wins after terminal cleanup. Otherwise
  // an unrelated completed local fixture could mask a just-finished online
  // result when the final-result route is refreshed.
  const state = storedState
    ?? (liveSnapshot?.view?.lifecycle === LIFECYCLE.COMPLETE ? liveSnapshot.view : null);
  const snapshot = state === liveSnapshot?.view
    ? liveSnapshot
    : { view: state, localSeatId: null };
  const isOnline = Boolean(onlineGameSession) || completedSummary?.mode === "ONLINE";
  if (state?.lifecycle !== LIFECYCLE.COMPLETE) {
    return unavailableResultScreen({ final: true, navigate, router, online: isOnline, onReturnToLobby });
  }

  const standings = finalStandingRows(state, (seatId) => seatName(snapshot, seatId));
  const history = handHistoryRows(state, (seatId) => seatName(snapshot, seatId));
  const presentation = completionPresentation(state, (seatId) => seatName(snapshot, seatId));
  const summary = copySafeResultSummary(state, (seatId) => seatName(snapshot, seatId));
  const status = resultStatus(presentation.status);
  const copySummary = async () => {
    try {
      if (typeof onCopyResultSummary === "function") await onCopyResultSummary(summary);
      else if (globalThis.navigator?.clipboard?.writeText) await globalThis.navigator.clipboard.writeText(summary);
      else throw new Error("Clipboard sharing is unavailable on this device.");
      status.textContent = "Result summary copied. It excludes private card history and match credentials.";
      status.dataset.state = "ready";
    } catch (error) {
      status.textContent = error?.message ?? "Could not copy the result summary.";
      status.dataset.state = "error";
    }
  };
  let starting = false;
  let startButton = null;
  const startNewMatch = async () => {
    if (starting) return;
    starting = true;
    if (startButton) {
      startButton.disabled = true;
      startButton.setAttribute("aria-busy", "true");
      startButton.querySelector(".action__label").textContent = isOnline
        ? "Requesting new match…"
        : "Starting new match…";
    }
    try {
      if (typeof onStartNewMatch === "function") {
        await onStartNewMatch({ mode: isOnline ? "online" : "local" });
        return;
      }
      if (!isOnline) {
        session.reset();
        navigate("/game");
      }
    } catch (error) {
      status.textContent = error?.message ?? "Could not start a new match.";
      status.dataset.state = "error";
      starting = false;
      if (startButton) {
        startButton.disabled = false;
        startButton.removeAttribute("aria-busy");
        startButton.querySelector(".action__label").textContent = isOnline
          ? "Play again"
          : "Start a new local match";
      }
    }
  };
  startButton = (!isOnline || typeof onStartNewMatch === "function")
    ? actionButton({
        label: isOnline ? "Play again" : "Start a new local match",
        onActivate: startNewMatch
      })
    : null;

  const forfeitHandIndex = state.completion?.duringHandIndex
    ?? state.hand?.index
    ?? Math.max(1, history.length);

  const shell = screenWithMenu({
    id: "final-result",
    context: presentation.context,
    title: presentation.title,
    status,
    content: [
      routeLine({
        current: state.completion?.reason === "FORFEIT" ? forfeitHandIndex : state.rules.handCount,
        total: state.rules.handCount,
        label: state.completion?.reason === "FORFEIT"
          ? `Match ended during hand ${forfeitHandIndex} after ${history.length} accepted hand ${history.length === 1 ? "result" : "results"}`
          : `Hand ${state.rules.handCount} of ${state.rules.handCount}`,
        compact: true
      }),
      scoreStrip({
        label: "Accepted final standings",
        scores: standings
      }),
      panel(
        "Hand-by-hand results",
        copy(presentation.kind === "forfeit"
          ? "Only accepted hand results before the forfeit are listed."
          : "Each hand shows its public penalty for every participant."),
        bulletList(historyCopy(history), { ordered: true })
      ),
      panel(
        "Result actions",
        copy(
          isOnline
            ? "The shared result excludes private card history."
            : "The local summary excludes private card history."
        ),
        stack(
          actionButton({
            label: "Copy result summary",
            variant: "secondary",
            onActivate: copySummary
          }),
          startButton,
          actionButton({
            label: "Return to Lobby",
            variant: "secondary",
            onActivate: () => returnToLobby(navigate, onReturnToLobby)
          })
        )
      )
    ],
    router,
    menuContent: [actionButton({ label: "Return to Lobby", variant: "secondary", onActivate: () => returnToLobby(navigate, onReturnToLobby) })]
  });
  const disposeFeedback = startResultFeedback(shell, localSession, "match-complete");
  shell.disposeScreen = disposeFeedback;
  return shell;
}
