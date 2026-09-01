import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type { IsoTimestamp, Transaction, TransactionState } from "@covenant/domain";

export interface TransactionDraft {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly cartMandateId: string;
  readonly paymentMandateId: string | null;
  readonly amountPaise: number;
  readonly currency: string;
  readonly state: TransactionState;
  readonly cooloffUntil: IsoTimestamp | null;
  readonly lastEventSeq: number;
}

const OPEN_SQL = `
  INSERT INTO transactions
    (id, tenant_id, user_id, cart_mandate_id, payment_mandate_id, rzp_order_id,
     rzp_payment_link_id, rzp_payment_id, amount_paise, currency, state,
     cooloff_until, cancelled_at, last_event_seq)
  VALUES (@id, @tenantId, @userId, @cartMandateId, @paymentMandateId, NULL,
          NULL, NULL, @amountPaise, @currency, @state,
          @cooloffUntil, NULL, @lastEventSeq)`;

const BY_ID_SQL = "SELECT * FROM transactions WHERE id = ?";

const BY_CART_SQL = "SELECT * FROM transactions WHERE cart_mandate_id = ?";

const BY_ORDER_SQL = "SELECT * FROM transactions WHERE rzp_order_id = ?";

const PENDING_SQL =
  "SELECT * FROM transactions WHERE state = 'pending_cooloff' ORDER BY cooloff_until";

/** The 5 s undo (§5.2 e): a cancel may only be reversed inside its own window. */
const RESTORE_SQL = `
  UPDATE transactions
     SET state = 'pending_cooloff', cancelled_at = NULL
   WHERE id = ? AND state = 'cancelled' AND cancelled_at > ?`;

/**
 * Every state move is a **guarded** `UPDATE` and the caller reads
 * `changes() === 1` (§5.2 e). Exactly one of "cool-off matured" and "user
 * cancelled" can win, and the loser is told the truth rather than accepted and
 * then contradicted by a webhook.
 */
export class TransactionStore {
  private readonly cache = new Map<string, Statement>();

  constructor(private readonly db: SqliteDatabase) {}

  open(draft: TransactionDraft): void {
    this.statement(OPEN_SQL).run({ ...draft });
  }

  byId(id: string): Transaction | null {
    return (this.statement(BY_ID_SQL).get(id) as Transaction | undefined) ?? null;
  }

  byCartMandate(cartMandateId: string): Transaction | null {
    const row = this.statement(BY_CART_SQL).get(cartMandateId) as
      | Transaction
      | undefined;
    return row ?? null;
  }

  /** The webhook's only handle on us: `ux_txn_order` makes it unambiguous. */
  byOrder(orderId: string): Transaction | null {
    const row = this.statement(BY_ORDER_SQL).get(orderId) as
      | Transaction
      | undefined;
    return row ?? null;
  }

  pendingCooloff(): readonly Transaction[] {
    return this.statement(PENDING_SQL).all() as Transaction[];
  }

  transition(
    id: string,
    from: TransactionState,
    to: TransactionState,
    cancelledAt: IsoTimestamp | null = null,
  ): boolean {
    const sql = `UPDATE transactions SET state = ?, cancelled_at = ?
                  WHERE id = ? AND state = ?`;
    return (
      this.statement(sql).run(to, cancelledAt, id, from).changes === 1
    );
  }

  restore(id: string, notBefore: IsoTimestamp): boolean {
    return this.statement(RESTORE_SQL).run(id, notBefore).changes === 1;
  }

  attach(id: string, column: "rzp_order_id" | "rzp_payment_link_id" | "rzp_payment_id", value: string): void {
    this.statement(`UPDATE transactions SET ${column} = ? WHERE id = ?`).run(
      value,
      id,
    );
  }

  private statement(sql: string): Statement {
    const cached = this.cache.get(sql);
    if (cached !== undefined) {
      return cached;
    }
    const prepared = this.db.prepare(sql);
    this.cache.set(sql, prepared);
    return prepared;
  }
}
