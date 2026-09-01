import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type { IsoTimestamp } from "@covenant/domain";

export interface EnvelopeReservationDraft {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly category: string;
  readonly periodKey: string;
  readonly amountPaise: number;
  readonly txnId: string;
  readonly cartMandateId: string;
  readonly createdAt: IsoTimestamp;
  /** Cart mandate `exp` + 10 min grace (decision 14). */
  readonly expiresAt: IsoTimestamp;
  readonly eventId: string;
}

export interface OpenReservation {
  readonly id: string;
  readonly txn_id: string;
  readonly category: string;
  readonly amount_paise: number;
  readonly expires_at: IsoTimestamp;
}

const RESERVE_SQL = `
  INSERT INTO envelope_reservations
    (id, tenant_id, user_id, category, period_key, amount_paise, state,
     txn_id, cart_mandate_id, created_at, expires_at, event_id)
  VALUES (@id, @tenantId, @userId, @category, @periodKey, @amountPaise, 'open',
          @txnId, @cartMandateId, @createdAt, @expiresAt, @eventId)`;

/** Guarded so a double callback is a no-op: `changes() === 0` means "already". */
const TRANSITION_SQL = `
  UPDATE envelope_reservations SET state = ?
   WHERE txn_id = ? AND state = 'open'`;

const BY_TXN_SQL =
  "SELECT id, txn_id, category, amount_paise, expires_at FROM envelope_reservations WHERE txn_id = ?";

/**
 * Reserve → capture → release (§5.2 c). Capacity is consumed at **verify**
 * time, not at capture time, which is what stops a burst of concurrent HNP
 * verifications from overshooting a cap. `UNIQUE(txn_id)` makes a retried
 * verify-cart unable to double-draw the envelope.
 */
export class EnvelopeReservationManager {
  private readonly cache = new Map<string, Statement>();

  constructor(private readonly db: SqliteDatabase) {}

  reserve(draft: EnvelopeReservationDraft): void {
    this.statement(RESERVE_SQL).run({ ...draft });
  }

  /** `true` when this call was the one that moved it out of `open`. */
  capture(txnId: string): boolean {
    return this.transition(txnId, "captured");
  }

  release(txnId: string): boolean {
    return this.transition(txnId, "released");
  }

  byTxn(txnId: string): OpenReservation | null {
    const row = this.statement(BY_TXN_SQL).get(txnId) as
      OpenReservation | undefined;
    return row ?? null;
  }

  private transition(txnId: string, state: string): boolean {
    return this.statement(TRANSITION_SQL).run(state, txnId).changes === 1;
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
