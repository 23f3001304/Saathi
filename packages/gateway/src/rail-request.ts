import type { Money, OrderRequest, PaymentMandate } from "@covenant/domain";

/**
 * `receipt` is the Payment Mandate `jti`, so Razorpay's duplicate-receipt
 * rejection turns a double submit into a 4xx rather than a second charge — the
 * belt to the local `nonces` table's braces (§2.5, razorpay decision 2).
 *
 * `notes` carries `{agent_present, mandate_id}`: the dashboard row is then
 * self-describing, and reconciling a disputed charge does not require the
 * ledger to be online.
 */
export function orderRequestOf(
  mandate: PaymentMandate,
  amount: Money,
): OrderRequest {
  return {
    amount,
    receipt: mandate.jti,
    notes: { agent_present: "true", mandate_id: mandate.jti },
  };
}
