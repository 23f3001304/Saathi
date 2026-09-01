import type { OrderView } from "../api/merchantTypes.ts";

// The states an order can be in, named for a shopkeeper rather than for the
// schema. Every one of them is a covenant state from packages/domain's
// TRANSACTION_STATES.
//
// There is no "packed", no "shipped", no "delivered", and there will not be:
// Covenant settles money against a signed basket and holds no goods. A column
// that only makes sense for a distributor would be a lie here.

export const STATE_LABELS: Record<string, string> = {
  pending_cooloff: "In cool-off",
  approved: "Approved",
  link_issued: "Awaiting payment",
  captured: "Paid",
  failed: "Payment failed",
  cancelled: "Cancelled in cool-off",
  parked: "Parked",
};

export const STATE_NOTES: Record<string, string> = {
  pending_cooloff: "Committed and not yet money. Only the buyer can cancel it.",
  approved: "Cleared to buy. A payment link comes next.",
  link_issued: "The buyer has a payment link. Nothing has been paid yet.",
  captured: "Razorpay took the money.",
  failed: "The payment did not go through. It waits rather than retrying.",
  cancelled: "The buyer changed their mind in time.",
  parked: "Set aside after a failure so it can be sorted out, not dropped.",
};

export function stateLabel(state: string): string {
  return STATE_LABELS[state] ?? state;
}

/** Money that has actually arrived, as opposed to money that is promised. */
export function capturedPaise(orders: readonly OrderView[]): number {
  return orders
    .filter((order) => order.state === "captured")
    .reduce((sum, order) => sum + order.amountPaise, 0);
}

export function cooloffOrders(orders: readonly OrderView[]): OrderView[] {
  return orders
    .filter((order) => order.state === "pending_cooloff")
    .sort((left, right) =>
      (left.cooloffUntil ?? "").localeCompare(right.cooloffUntil ?? ""),
    );
}

export function committedPaise(orders: readonly OrderView[]): number {
  return cooloffOrders(orders).reduce(
    (sum, order) => sum + order.amountPaise,
    0,
  );
}

/**
 * How long until a hold releases, in whole minutes. `null` when the row has no
 * release time at all rather than guessing one, and a past time reads as due
 * rather than as a negative number.
 */
export function minutesUntil(iso: string | null, now: Date): number | null {
  if (iso === null) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.round((at - now.getTime()) / 60000));
}

export function releaseNote(order: OrderView, now: Date): string {
  const minutes = minutesUntil(order.cooloffUntil, now);
  if (minutes === null) return "No release time recorded.";
  if (minutes === 0) return "Releasing now.";
  return `Releases in ${minutes.toString()} min.`;
}
