// The words a pill is written in. Split out of beatSignals.ts so the mapper
// there stays a mapper: what a beat becomes is one decision, how it reads is
// another, and only the second one is copy.
import type { AgentBeat } from "../api/agentBeat.ts";
import { rupeesRounded } from "../primitives/formatMoney.ts";

export const OUTCOME_TEXT: Record<string, string> = {
  link_issued: "Your payment link is ready.",
  cooloff_parked: "Held for your cool-off. No money has moved.",
  awaiting_user: "This needs your signature before anything is charged.",
  rejected: "That cart was refused.",
  bounded: "Stopped by a rule you signed.",
  failed: "That did not finish.",
};

/** The gateway's word for what it decided, in the buyer's word for it. An
 *  unmapped decision is printed as it came rather than guessed at. */
export const DECISION_TEXT: Record<string, string> = {
  allow: "Cleared",
  deny: "Refused",
  hold: "Held",
};

const KEPT_AT: Record<string, string> = {
  P3: "Remembered — you signed it",
  P2: "Remembered — the merchant signed for it",
  P1: "Remembered — from something I checked myself",
  P0: "Noted, but not trusted — read off a merchant's page",
};

/**
 * Reason codes are precise and unreadable. They stay precise where precision
 * is the point — the ledger, and the refusals sheet behind the chip — and the
 * conversation says what happened in words.
 */
/** R0 is the tier gate; R1 upward are the rules that guard a signed bound. */
function refusedLine(rule: string | null): string {
  const contradiction = rule !== null && rule !== "" && !rule.startsWith("R0");
  return contradiction
    ? "Refused — that would have loosened a rule you signed"
    : "Not remembered — text on a merchant's page is not a fact";
}

export function memoryLine(
  beat: Extract<AgentBeat, { kind: "memory" }>,
): string {
  if (beat.status === "rejected") return refusedLine(beat.rule);
  if (beat.status === "superseded" || beat.status === "shadowed") {
    return "Replaced what it knew before";
  }
  const tier = beat.tierGranted;
  if (tier === null) return "Remembered";
  return KEPT_AT[tier] ?? "Remembered";
}

export function sortLine(
  beat: Extract<AgentBeat, { kind: "sort-key" }>,
): string {
  if (beat.label.trim() === "") return `Sorted by ${beat.sortKey}`;
  return `${beat.label} (${beat.sortKey})`;
}

/** The digest belongs on the Ledger, where someone is checking it. */
export function cartLine(beat: Extract<AgentBeat, { kind: "cart" }>): string {
  const quote = beat.quoteOk ? "signed quote" : "no signed quote";
  const items = `${beat.itemCount} item${beat.itemCount === 1 ? "" : "s"}`;
  return `Cart built · ${items} · ${rupeesRounded(beat.totalPaise)} · ${quote}`;
}
