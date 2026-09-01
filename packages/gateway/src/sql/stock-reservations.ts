import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type { IsoTimestamp, StockReservationState } from "@covenant/domain";

export interface StockClaim {
  readonly reservationId: string;
  readonly tenantId: string;
  readonly merchantId: string;
  readonly skuId: string;
  readonly qty: number;
  readonly quoteJti: string;
  readonly cartMandateId: string;
  readonly expiresAt: IsoTimestamp;
  readonly eventId: string;
}

interface StockRow {
  readonly reservation_id: string;
  readonly tenant_id: string;
  readonly merchant_id: string;
  readonly sku_id: string;
  readonly qty: number;
  readonly quote_jti: string;
  readonly cart_mandate_id: string;
  readonly state: string;
  readonly expires_at: string;
}

const CLAIM_SQL = `
  INSERT INTO stock_reservations
    (reservation_id, tenant_id, merchant_id, sku_id, qty, quote_jti,
     cart_mandate_id, state, expires_at, event_id)
  VALUES (@reservationId, @tenantId, @merchantId, @skuId, @qty, @quoteJti,
          @cartMandateId, 'claimed', @expiresAt, @eventId)`;

const FIND_SQL = "SELECT * FROM stock_reservations WHERE reservation_id = ?";

const TRANSITION_SQL = `
  UPDATE stock_reservations SET state = ?
   WHERE reservation_id = ? AND state = 'claimed'`;

/**
 * The last-unit race resolver (§5.2 d). The merchant mints one `reservation_id`
 * per unit and it is this table's primary key, so the first cart mandate to
 * commit the claim wins and the second takes a `SQLITE_CONSTRAINT` that the
 * commit phase turns into `STOCK_CONFLICT` — a code deliberately distinct from
 * `CART_QUOTE_MISMATCH`, because losing a legitimate race is not misbehaviour
 * and must not poison merchant trust.
 */
export class StockReservationManager {
  private readonly cache = new Map<string, Statement>();

  constructor(private readonly db: SqliteDatabase) {}

  find(reservationId: string): StockReservationState | null {
    const row = this.statement(FIND_SQL).get(reservationId) as
      | StockRow
      | undefined;
    return row === undefined ? null : stateOf(row);
  }

  /** Throws `SQLITE_CONSTRAINT_PRIMARYKEY` on a reused id — that is the point. */
  claim(claim: StockClaim): void {
    this.statement(CLAIM_SQL).run({ ...claim });
  }

  confirm(reservationId: string): boolean {
    return this.transition(reservationId, "confirmed");
  }

  release(reservationId: string): boolean {
    return this.transition(reservationId, "released");
  }

  private transition(reservationId: string, state: string): boolean {
    return this.statement(TRANSITION_SQL).run(state, reservationId).changes === 1;
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

function stateOf(row: StockRow): StockReservationState {
  return {
    reservation_id: row.reservation_id,
    merchant_id: row.merchant_id,
    sku_id: row.sku_id,
    qty: row.qty,
    quote_jti: row.quote_jti,
    cart_mandate_id: row.cart_mandate_id,
    state: row.state as StockReservationState["state"],
    expires_at: row.expires_at,
  };
}
