// The merchant agent's briefing: one ranked answer to "why am I not being
// picked", assembled from the four reads and nothing else.
//
// DECISION: deterministic, in code, not a model's summary. Why: every figure
// on this dashboard comes from the ledger or from Razorpay, and a paragraph
// generated over those figures is a fifth source that nobody can check. The
// agent's job here is to *order* the merchant's problems and say what each one
// costs; the numbers inside every sentence are read straight from the folds.
import type {
  DemandView,
  LeakageView,
  ListingAuditView,
  StandingView,
} from "../api/merchantTypes.ts";
import { opening, plural } from "../primitives/plural.ts";

export type BriefingItem = {
  key: string;
  headline: string;
  detail: string;
  /**
   * `scored` items are the ones the trust fold actually charges for, and they
   * are ranked above everything else however small they look: a shop with two
   * quote mismatches and fifty stale quotes has one problem that costs it
   * placements and one that costs it a longer TTL.
   */
  scored: boolean;
  /** Rank within a band. Never a currency figure. */
  weight: number;
};

export interface BriefingInput {
  readonly standing: StandingView | null;
  readonly audit: ListingAuditView | null;
  readonly demand: DemandView | null;
  readonly leakage: LeakageView | null;
}

function mismatchHeadline(mismatches: number, total: number): string {
  if (total === 1) {
    return "The one price you signed did not match what the buyer was charged";
  }
  return `${mismatches} of your ${total} signed prices did not match what the buyer was charged`;
}

function mismatchItem(standing: StandingView): BriefingItem | null {
  const { quotesTotal, quoteMismatches } = standing.counters;
  if (quoteMismatches === 0) return null;
  return {
    key: "mismatch",
    headline: mismatchHeadline(quoteMismatches, quotesTotal),
    detail:
      "Nothing costs you more. An agent reads it as a shop that changed the " +
      "price after saying it. Close the gap between what you promise and what " +
      "you charge before anything else.",
    scored: true,
    weight: 0.6 * (quoteMismatches / Math.max(quotesTotal, 1)),
  };
}

function cueHeadline(flagged: number): string {
  return flagged === 1
    ? "One of your listings carries copy that buyer agents flag"
    : `${flagged} of your listings carry copy that buyer agents flag`;
}

/** "2 tricks across them" reads as nonsense when "them" is one listing. */
function cueDetail(kinds: number, flagged: number): string {
  const where = flagged === 1 ? "in it" : "across them";
  return (
    `${opening(kinds, "kind of trick", "different tricks")} ${where}. ` +
    "Those lines are written to work " +
    "on a person in a hurry. A buyer's agent already has its limits in " +
    "writing, so they win you nothing and cost you its trust."
  );
}

function cueItem(audit: ListingAuditView): BriefingItem | null {
  const flagged = audit.listings.filter((row) => row.cues.length > 0);
  if (flagged.length === 0) return null;
  const kinds = Object.keys(audit.byKind).length;
  return {
    key: "cues",
    headline: cueHeadline(flagged.length),
    detail: cueDetail(kinds, flagged.length),
    scored: false,
    weight: 0.25 * (flagged.length / Math.max(audit.listings.length, 1)),
  };
}

function staleItem(leakage: LeakageView): BriefingItem | null {
  const stale = leakage.refusals.find(
    (row) => row.reasonCode === "QUOTE_EXPIRED",
  );
  if (stale === undefined) return null;
  return {
    key: "stale",
    headline:
      stale.count === 1
        ? "A buyer came back after your price had expired"
        : `${stale.count} buyers came back after your price had expired`,
    detail:
      "Nothing dishonest happened and the sale still did not. Holding your " +
      "price open for longer is the whole fix, and it costs you nothing.",
    scored: false,
    weight: 0.2,
  };
}

function topAsk(query: string, asks: number): string {
  if (asks === 1) return `Someone asked for "${query}".`;
  return `The most common was "${query}", asked ${plural(asks, "time")}.`;
}

function demandItem(demand: DemandView): BriefingItem | null {
  const top = demand.unmet[0];
  if (top === undefined) return null;
  const asks = demand.unmet.reduce((sum, ask) => sum + ask.asks, 0);
  return {
    key: "demand",
    headline:
      asks === 1
        ? "A search found nothing on your shelf"
        : `${asks} searches found nothing on your shelf`,
    detail: `${topAsk(top.query, top.asks)} These are the only sales you can see that never happened.`,
    scored: false,
    weight: 0.15,
  };
}

function refundItem(leakage: LeakageView): BriefingItem | null {
  const { refundsRequested, refundsHonored } = leakage.counters;
  if (refundsRequested === 0 || refundsHonored === refundsRequested)
    return null;
  return {
    key: "refunds",
    headline: `${opening(refundsRequested - refundsHonored, "refund")} you did not give`,
    detail:
      "The smallest thing on this list and the easiest to fix. A refund you " +
      "did not give reads as a promise you will not keep.",
    scored: true,
    weight: 0.15 * (1 - refundsHonored / refundsRequested),
  };
}

/**
 * Scored problems first, then the rest, each band by weight. A cue in a
 * listing is not yet a penalty — it becomes one when a buyer's write gate
 * refuses it — so it ranks below anything the fold is already charging for.
 */
export function briefingFor(input: BriefingInput): BriefingItem[] {
  const items = [
    input.standing === null ? null : mismatchItem(input.standing),
    input.audit === null ? null : cueItem(input.audit),
    input.leakage === null ? null : staleItem(input.leakage),
    input.leakage === null ? null : refundItem(input.leakage),
    input.demand === null ? null : demandItem(input.demand),
  ].filter((item): item is BriefingItem => item !== null);
  return items.sort(
    (left, right) =>
      Number(right.scored) - Number(left.scored) || right.weight - left.weight,
  );
}
