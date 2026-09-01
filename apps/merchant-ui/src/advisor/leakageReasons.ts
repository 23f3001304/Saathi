// Why a sale was turned down, said as what it cost the shop. The gateway's own
// frozen sentences explain the same fact to a buyer; these are the seller's
// half, in words a shopkeeper would use out loud.
//
// The code itself stays on the row. This is the one screen where a merchant is
// deliberately auditing rather than working, and the code is what they would
// quote if they came to ask us about it.
import type { LeakageView } from "../api/merchantTypes.ts";

const REFUSALS: Record<string, { label: string; cost: string }> = {
  CART_QUOTE_MISMATCH: {
    label: "The price changed after you signed it",
    cost: "The buyer was charged something other than the price you signed. Nothing costs you more, and it is the one thing agents do not forgive twice.",
  },
  QUOTE_EXPIRED: {
    label: "Your price went stale",
    cost: "The buyer came back after your price had expired. Nothing dishonest happened; the sale still did not.",
  },
  REFUNDABILITY_REQUIRED: {
    label: "The buyer needed to be able to return it",
    cost: "They would only buy something returnable, and this listing does not say it is. Returns are a promise, not a courtesy.",
  },
  STOCK_CONFLICT: {
    label: "Two buyers wanted the last one",
    cost: "One of them lost the race. Never held against you.",
  },
  COOLOFF_HOLD: {
    label: "Held for second thoughts",
    cost: "The buyer gets time to change their mind before the money moves.",
  },
  CART_EXCEEDS_INTENT_CAP: {
    label: "Over what the buyer would spend",
    cost: "The basket came in above the limit they had set. A cheaper line, or a smaller basket, is the whole fix.",
  },
  SKU_NOT_ALLOWED: {
    label: "Not what the buyer was looking for",
    cost: "The item was outside what they had agreed to buy.",
  },
  MERCHANT_NOT_ALLOWED: {
    label: "The buyer was not shopping with you",
    cost: "Your shop was outside the set they had agreed to buy from.",
  },
};

export type LeakageLine = {
  reasonCode: string;
  label: string;
  count: number;
  cost: string;
};

export function leakageLines(leakage: LeakageView): LeakageLine[] {
  return leakage.refusals.map((refusal) => ({
    reasonCode: refusal.reasonCode,
    label: REFUSALS[refusal.reasonCode]?.label ?? "A sale was turned down",
    count: refusal.count,
    cost:
      REFUSALS[refusal.reasonCode]?.cost ??
      "This is what the system said when it turned the sale down.",
  }));
}

/** Cancelled after buying, as a share of the baskets that reached a decision. */
export function cooloffRate(leakage: LeakageView): number {
  const carts = leakage.counters.cartsTotal;
  return carts === 0 ? 0 : leakage.counters.cooloffCancellations / carts;
}

export function refundHonourRate(leakage: LeakageView): number {
  const asked = leakage.counters.refundsRequested;
  return asked === 0 ? 1 : leakage.counters.refundsHonored / asked;
}
