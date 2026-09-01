import type { Database as SqliteDatabase } from "better-sqlite3";

/** What the bill is allowed to say about the money, and where each part came from. */
export type SettledState = "waiting" | "paid" | "failed";

export interface PaymentView {
  readonly txn_id: string;
  readonly txn_state: string;
  readonly payment_state: SettledState;
  readonly rzp_order_id: string | null;
  readonly rzp_payment_id: string | null;
  readonly payment_link_url: string | null;
  /** The mandate that authorised this payment; it correlates the poll's own
   *  ledger appends the same way the webhook path's do. */
  readonly payment_mandate_id: string | null;
  readonly amount_paise: number;
  readonly currency: string;
  /**
   * The publishable `rzp_test_…` / `rzp_live_…` key id, so the browser can open
   * Razorpay's own checkout on this order. Key **ids** are publishable by
   * design; the secret is never read here and never leaves the gateway. It
   * rides on this response rather than a second config route because the one
   * question the bill asks is "how do I pay this transaction, and did it pay".
   */
  readonly checkout_key_id: string;
}

interface TxnRow {
  readonly id: string;
  readonly state: string;
  readonly rzp_order_id: string | null;
  readonly rzp_payment_id: string | null;
  readonly payment_mandate_id: string | null;
  readonly amount_paise: number;
  readonly currency: string;
}

interface EventRow {
  readonly kind: string;
  readonly payload_json: string;
}

const TXN_SQL = `SELECT id, state, rzp_order_id, rzp_payment_id,
    payment_mandate_id, amount_paise, currency
  FROM transactions WHERE id = ? AND tenant_id = ?`;

/**
 * The outcome events themselves, not the folded `transactions.state`. Both are
 * written in the same ledger transaction so they cannot disagree, but the
 * append is the fact and the column is the fold, and a read that says "paid"
 * should be able to point at the line that says so.
 */
const EVENT_SQL = `SELECT kind, payload_json FROM events
  WHERE txn_id = ? AND kind IN ('payment.captured', 'payment.failed', 'rzp.link.created')
  ORDER BY seq`;

function payloadOf(row: EventRow): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(row.payload_json);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

interface Observed {
  readonly state: SettledState;
  readonly paymentId: string | null;
  readonly linkUrl: string | null;
}

function foldEvents(rows: readonly EventRow[]): Observed {
  let state: SettledState = "waiting";
  let paymentId: string | null = null;
  let linkUrl: string | null = null;
  for (const row of rows) {
    const payload = payloadOf(row);
    if (row.kind === "rzp.link.created") {
      linkUrl = stringOrNull(payload["short_url"]);
      continue;
    }
    state = row.kind === "payment.captured" ? "paid" : "failed";
    paymentId = stringOrNull(payload["rzp_payment_id"]);
  }
  return { state, paymentId, linkUrl };
}

/**
 * `GET /v1/transactions/:id/payment`: the one question a bill on screen keeps
 * asking after the run that made it has ended. On the read-only WAL snapshot
 * like every other read (§5.1), so a shopper's open bill cannot block a
 * verdict.
 */
export class PaymentQueries {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly keyId: string,
  ) {}

  byTxn(tenantId: string, txnId: string): PaymentView | null {
    const txn = this.db.prepare(TXN_SQL).get(txnId, tenantId) as
      | TxnRow
      | undefined;
    if (txn === undefined) {
      return null;
    }
    const observed = foldEvents(
      this.db.prepare(EVENT_SQL).all(txnId) as EventRow[],
    );
    return {
      txn_id: txn.id,
      txn_state: txn.state,
      payment_state: observed.state,
      rzp_order_id: txn.rzp_order_id,
      rzp_payment_id: observed.paymentId ?? txn.rzp_payment_id,
      payment_link_url: observed.linkUrl,
      payment_mandate_id: txn.payment_mandate_id,
      amount_paise: txn.amount_paise,
      currency: txn.currency,
      checkout_key_id: this.keyId,
    };
  }
}
