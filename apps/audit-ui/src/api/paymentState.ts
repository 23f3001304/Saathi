// `GET /v1/transactions/:id/payment` — the bill's own question, asked of the
// gateway's read model rather than answered from anything the browser saw.
import { getJson } from "./gatewayFetch.ts";
import { isLive } from "./liveMode.ts";

export type SettledState = "waiting" | "paid" | "failed";

export type PaymentState = {
  readonly txnId: string;
  readonly txnState: string;
  readonly settled: SettledState;
  readonly orderId: string | null;
  readonly paymentId: string | null;
  readonly linkUrl: string | null;
  readonly amountPaise: number;
  readonly currency: string;
  readonly keyId: string | null;
};

interface RawPaymentState {
  txn_id: string;
  txn_state: string;
  payment_state: string;
  rzp_order_id: string | null;
  rzp_payment_id: string | null;
  payment_link_url: string | null;
  amount_paise: number;
  currency: string;
  checkout_key_id: string;
}

/**
 * An unknown settled value reads as `waiting`, never as paid. Every other
 * mapping in this app may guess; this one may not — "paid" is the single word
 * on this screen that a shopper will act on, so it is only ever spoken when
 * the gateway said exactly that.
 */
function settledOf(raw: string): SettledState {
  if (raw === "paid" || raw === "failed") return raw;
  return "waiting";
}

function mapState(raw: RawPaymentState): PaymentState {
  return {
    txnId: raw.txn_id,
    txnState: raw.txn_state,
    settled: settledOf(raw.payment_state),
    orderId: raw.rzp_order_id,
    paymentId: raw.rzp_payment_id,
    linkUrl: raw.payment_link_url,
    amountPaise: raw.amount_paise,
    currency: raw.currency,
    // "" is the gateway saying it holds no publishable key (the fake rail).
    keyId: raw.checkout_key_id === "" ? null : raw.checkout_key_id,
  };
}

export async function fetchPaymentState(
  txnId: string,
): Promise<PaymentState | null> {
  if (!isLive()) return null;
  const raw = await getJson<RawPaymentState>(
    `/v1/transactions/${encodeURIComponent(txnId)}/payment`,
  );
  return mapState(raw);
}
