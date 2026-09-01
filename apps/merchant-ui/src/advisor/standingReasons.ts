// Why an AI buyer would, or would not, offer this merchant first — said in
// sentences, out of the same counters the fold keeps. Nothing here is derived
// that the ledger does not record.
import type { StandingView } from "../api/merchantTypes.ts";
import { plural } from "../primitives/plural.ts";

export type ReasonTone = "keeps" | "costs" | "aside";

export type Reason = { tone: ReasonTone; text: string };

const COUNTS_MOST = "This counts for more than anything else.";

function quotesKept(total: number): string {
  return total === 1
    ? "The one price you signed matched what the buyer was charged."
    : `All ${total.toString()} prices you signed matched what the buyer was charged.`;
}

function quotesMissed(missed: number, total: number): string {
  return total === 1
    ? "The one price you signed did not match what the buyer was charged."
    : `${missed.toString()} of ${total.toString()} prices you signed did not match what the buyer was charged.`;
}

function quoteReason(standing: StandingView): Reason | null {
  const { quotesTotal, quoteMismatches } = standing.counters;
  if (quotesTotal === 0) return null;
  if (quoteMismatches === 0) {
    return { tone: "keeps", text: `${quotesKept(quotesTotal)} ${COUNTS_MOST}` };
  }
  return {
    tone: "costs",
    text: `${quotesMissed(quoteMismatches, quotesTotal)} ${COUNTS_MOST}`,
  };
}

function channelReason(standing: StandingView): Reason | null {
  const { catalogReads, manipulationAttempts } = standing.counters;
  if (catalogReads === 0) return null;
  if (manipulationAttempts === 0) {
    return {
      tone: "keeps",
      text: `Buyers read your listings ${plural(catalogReads, "time")} and never found an instruction hidden in a description.`,
    };
  }
  return {
    tone: "costs",
    text: `${plural(manipulationAttempts, "description of yours", "of your descriptions")} tried to tell a buyer’s agent what to do, across ${plural(catalogReads, "read")}. Each was refused, and counted here.`,
  };
}

function refundReason(standing: StandingView): Reason | null {
  const { refundsRequested, refundsHonored } = standing.counters;
  if (refundsRequested === 0) return null;
  return {
    tone: refundsHonored === refundsRequested ? "keeps" : "costs",
    text: `${refundsHonored} of ${plural(refundsRequested, "refund")} honoured.`,
  };
}

function priorReason(standing: StandingView): Reason | null {
  if (standing.observations >= standing.priorPseudoCount * 2) return null;
  return {
    tone: "aside",
    text: `Only ${plural(standing.observations, "thing")} to go on so far, so this still sits close to the ${standing.priorScore.toFixed(2)} every new shop starts on. Selling moves it; nothing else does.`,
  };
}

function stockReason(standing: StandingView): Reason | null {
  if (standing.stockConflicts === 0) return null;
  return {
    tone: "aside",
    text: `${plural(standing.stockConflicts, "race")} for the last one, lost. Counted, but never held against you — losing a fair race is not bad behaviour.`,
  };
}

const RULES = [
  quoteReason,
  channelReason,
  refundReason,
  priorReason,
  stockReason,
];

export function reasonsFor(standing: StandingView): Reason[] {
  return RULES.map((rule) => rule(standing)).filter(
    (reason): reason is Reason => reason !== null,
  );
}
