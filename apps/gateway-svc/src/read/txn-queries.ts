import type { Database as SqliteDatabase } from "better-sqlite3";

import { readUnverifiedIssuer } from "@covenant/mandates";

interface TxnRow {
  readonly id: string;
  readonly state: string;
  readonly amount_paise: number;
  readonly currency: string;
  readonly cart_mandate_id: string;
  readonly cooloff_until: string | null;
  readonly created_at: string | null;
  readonly cart_jwt: string | null;
}

interface CueRow {
  readonly txn_id: string | null;
  readonly reason_code: string | null;
}

/**
 * `created_at` is the **cart mandate's `iat`**, not a column: `transactions`
 * (§3.7) carries no creation timestamp, and the moment the cart was signed is
 * the one the audit UI's list is actually ordering by.
 */
const LIST_SQL = `SELECT t.id, t.state, t.amount_paise, t.currency,
    t.cart_mandate_id, t.cooloff_until, m.iat AS created_at, m.vc_jwt AS cart_jwt
  FROM transactions t
  LEFT JOIN mandates m ON m.id = t.cart_mandate_id
  WHERE t.tenant_id = ? AND (? IS NULL OR t.state = ?)
  ORDER BY t.last_event_seq DESC
  LIMIT ?`;

const COOLOFF_SQL = `SELECT t.id, t.state, t.amount_paise, t.currency,
    t.cart_mandate_id, t.cooloff_until, m.iat AS created_at, m.vc_jwt AS cart_jwt
  FROM transactions t
  LEFT JOIN mandates m ON m.id = t.cart_mandate_id
  WHERE t.tenant_id = ? AND t.state = 'pending_cooloff'
  ORDER BY t.cooloff_until`;

const CUES_SQL = `SELECT txn_id, reason_code FROM attack_lane
  WHERE tenant_id = ? AND txn_id IS NOT NULL`;

export interface TransactionItem {
  readonly txn_id: string;
  readonly state: string;
  readonly amount_paise: number;
  readonly currency: string;
  readonly merchant_id: string | null;
  readonly cart_mandate_id: string;
  readonly created_at: string | null;
  readonly cooloff_until: string | null;
}

export interface CooloffItem {
  readonly id: string;
  readonly txn_id: string;
  readonly amount_paise: number;
  readonly release_at: string | null;
  readonly merchant: string | null;
  readonly cues: readonly string[];
}

/** The merchant is the cart mandate's `iss`; the row itself does not carry it. */
function merchantOf(row: TxnRow): string | null {
  if (row.cart_jwt === null) {
    return null;
  }
  try {
    return readUnverifiedIssuer(row.cart_jwt);
  } catch {
    return null;
  }
}

/**
 * `/transactions` and `/cooloff` (§4.10), on the read-only WAL snapshot: a
 * judge refreshing the audit UI can never block the write path (§5.1).
 */
export class TransactionQueries {
  constructor(private readonly db: SqliteDatabase) {}

  list(
    tenantId: string,
    limit: number,
    state: string | null,
  ): readonly TransactionItem[] {
    const rows = this.db
      .prepare(LIST_SQL)
      .all(tenantId, state, state, limit) as TxnRow[];
    return rows.map((row) => ({
      txn_id: row.id,
      state: row.state,
      amount_paise: row.amount_paise,
      currency: row.currency,
      merchant_id: merchantOf(row),
      cart_mandate_id: row.cart_mandate_id,
      created_at: row.created_at,
      cooloff_until: row.cooloff_until,
    }));
  }

  /** The dock's cues are attack-lane reason codes, not a second alert channel. */
  cooloffDock(tenantId: string): readonly CooloffItem[] {
    const cues = this.cuesByTxn(tenantId);
    const rows = this.db.prepare(COOLOFF_SQL).all(tenantId) as TxnRow[];
    return rows.map((row) => ({
      id: row.cart_mandate_id,
      txn_id: row.id,
      amount_paise: row.amount_paise,
      release_at: row.cooloff_until,
      merchant: merchantOf(row),
      cues: cues.get(row.id) ?? [],
    }));
  }

  private cuesByTxn(tenantId: string): Map<string, string[]> {
    const rows = this.db.prepare(CUES_SQL).all(tenantId) as CueRow[];
    const byTxn = new Map<string, string[]>();
    for (const row of rows) {
      if (row.txn_id === null || row.reason_code === null) {
        continue;
      }
      const bucket = byTxn.get(row.txn_id) ?? [];
      bucket.push(row.reason_code);
      byTxn.set(row.txn_id, bucket);
    }
    return byTxn;
  }
}
