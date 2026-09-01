import type { CheckoutOutcome } from "@covenant/agents";

import type { BeatDraft } from "../http/beat-draft.js";
import type { RunStatus } from "./purchase-result.js";

export interface Settlement {
  readonly status: RunStatus;
  readonly txnId: string | null;
  readonly beat: BeatDraft;
}

/**
 * A rejection and a cool-off hold are `bounded`, not `failed`: the covenant did
 * its job, and a demo that coloured "your agent was stopped from overspending"
 * the same red as "the process crashed" would be lying about which of the two
 * just happened. `failed` means the system could not answer at all.
 */
const STATUS_OF: Record<CheckoutOutcome["kind"], RunStatus> = {
  paid: "completed",
  held: "bounded",
  awaiting_user: "bounded",
  rejected: "bounded",
  failed: "failed",
};

function detailOf(outcome: CheckoutOutcome): string {
  switch (outcome.kind) {
    case "paid":
      // No link is a real outcome, not a missing value: the order is there and
      // the bill can still be paid on it, so the line says which one it is.
      return outcome.paymentLink === null
        ? `${outcome.rzpOrderId} · no link issued — pay on the bill`
        : `${outcome.rzpOrderId} · ${outcome.paymentLink}`;
    case "held":
      return `Parked until ${outcome.until}; cancel at ${outcome.cancelUrl}`;
    case "awaiting_user":
      return "The gateway issued a Payment Mandate draft; your authorization is still owed.";
    default:
      // The code is the ledger's name for this, not the shopper's. With no
      // human sentence the outcome line says its own sentence and stops.
      return outcome.plan.human ?? "";
  }
}

function stateOf(outcome: CheckoutOutcome): string {
  return outcome.kind === "paid"
    ? "link_issued"
    : outcome.kind === "held"
      ? "cooloff_parked"
      : outcome.kind;
}

function txnOf(outcome: CheckoutOutcome): string | null {
  return outcome.kind === "failed" ? null : outcome.txnId;
}

/** The gateway's answer, translated once, for the beat stream and the trail. */
export function settlementOf(outcome: CheckoutOutcome): Settlement {
  const txnId = txnOf(outcome);
  return {
    txnId,
    status: STATUS_OF[outcome.kind],
    beat: {
      kind: "outcome",
      state: stateOf(outcome),
      txnId,
      detail: detailOf(outcome),
    },
  };
}
