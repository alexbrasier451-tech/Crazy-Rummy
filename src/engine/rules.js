import {
  DEFAULT_RULES,
  HAND_SCHEDULE,
  RANKS,
  RULES_VERSION
} from "./constants.js";
import { normalizeRank } from "./cards.js";

const ruleKeys = Object.freeze(Object.keys(DEFAULT_RULES));

function freezeSchedule() {
  return Object.freeze(HAND_SCHEDULE.map((hand) => Object.freeze({ ...hand })));
}

export function createRules(overrides = {}) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new TypeError("Rule overrides must be a plain object.");
  }
  const { handSchedule, ...ruleOverrides } = overrides;
  if (handSchedule !== undefined) {
    if (!Array.isArray(handSchedule) || handSchedule.length !== HAND_SCHEDULE.length
      || handSchedule.some((hand, index) => hand?.index !== HAND_SCHEDULE[index].index
        || hand?.wildRank !== HAND_SCHEDULE[index].wildRank)) {
      throw new RangeError("Rule hand schedule must match the fixed thirteen-hand schedule.");
    }
  }
  for (const key of Object.keys(ruleOverrides)) {
    if (!ruleKeys.includes(key)) throw new RangeError(`Unknown rule: ${key}`);
  }

  const rules = { ...DEFAULT_RULES, ...ruleOverrides };
  if (rules.rulesVersion !== RULES_VERSION) {
    throw new RangeError(`Unsupported rules version: ${rules.rulesVersion}`);
  }
  if (!Number.isInteger(rules.minimumPlayers) || !Number.isInteger(rules.maximumPlayers)
    || rules.minimumPlayers < 2 || rules.maximumPlayers > 6
    || rules.minimumPlayers > rules.maximumPlayers) {
    throw new RangeError("Rules must allow between two and six players.");
  }
  if (rules.cardsPerPlayer !== 7 || rules.handCount !== HAND_SCHEDULE.length) {
    throw new RangeError("Crazy Rummy uses seven base cards and the fixed thirteen-hand schedule.");
  }
  for (const key of ruleKeys.filter((key) => typeof DEFAULT_RULES[key] === "boolean")) {
    if (typeof rules[key] !== "boolean") throw new TypeError(`${key} must be boolean.`);
  }

  return Object.freeze({ ...rules, handSchedule: freezeSchedule() });
}

export const CANONICAL_RULES = createRules();

export function handForIndex(handIndex) {
  if (!Number.isInteger(handIndex) || handIndex < 1 || handIndex > HAND_SCHEDULE.length) {
    throw new RangeError(`Hand index must be between 1 and ${HAND_SCHEDULE.length}.`);
  }
  return HAND_SCHEDULE[handIndex - 1];
}

export function wildRankForHand(handIndex) {
  return handForIndex(handIndex).wildRank;
}

export function isHandIndex(handIndex) {
  return Number.isInteger(handIndex) && handIndex >= 1 && handIndex <= HAND_SCHEDULE.length;
}

export function naturalCardValue(rank) {
  const normalized = normalizeRank(rank);
  if (["J", "Q", "K"].includes(normalized)) return 10;
  if (normalized === "A") return 1;
  return Number(normalized);
}

export function isKnownRank(rank) {
  try {
    return RANKS.includes(normalizeRank(rank));
  } catch {
    return false;
  }
}
