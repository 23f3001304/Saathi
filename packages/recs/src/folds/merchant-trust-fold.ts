import type { Database as SqliteDatabase } from "better-sqlite3";

import type { EventKind, EventPayload, StoredEvent } from "@covenant/domain";
import type { FoldReducer } from "@covenant/ledger";

import { optionalText } from "../fold-support.js";
import { scoreFor } from "../trust-score.js";

/** Every counter the `merchant_trust` row tracks — a superset of `TrustCounters`. */
interface TrustRow {
  readonly quotesTotal: number;
  readonly quoteMismatches: number;
  readonly catalogReads: number;
  readonly manipulationAttempts: number;
  readonly refundsRequested: number;
  readonly refundsHonored: number;
  readonly cooloffCancellations: number;
  readonly stockConflicts: number;
  readonly cartsTotal: number;
}

const ZERO_ROW: TrustRow = {
  quotesTotal: 0,
  quoteMismatches: 0,
  catalogReads: 0,
  manipulationAttempts: 0,
  refundsRequested: 0,
  refundsHonored: 0,
  cooloffCancellations: 0,
  stockConflicts: 0,
  cartsTotal: 0,
};

/** The reason code R4 (`AuthorityClaimRule`) stamps a poisoning attempt with. */
const POISONING_REASON = "AUTHORITY_CLAIM_IN_UNTRUSTED_CHANNEL";
const MISMATCH_REASON = "CART_QUOTE_MISMATCH";

const SELECT_SQL = `SELECT quotes_total AS quotesTotal, quote_mismatches AS quoteMismatches,
  catalog_reads AS catalogReads, manipulation_attempts AS manipulationAttempts,
  refunds_requested AS refundsRequested, refunds_honored AS refundsHonored,
  cooloff_cancellations AS cooloffCancellations, stock_conflicts AS stockConflicts,
  carts_total AS cartsTotal
  FROM merchant_trust WHERE tenant_id = ? AND merchant_id = ?`;

const UPSERT_SQL = `INSERT INTO merchant_trust
  (tenant_id, merchant_id, quotes_total, quote_mismatches, catalog_reads,
   manipulation_attempts, refunds_requested, refunds_honored,
   cooloff_cancellations, stock_conflicts, carts_total, trust_score, last_event_seq)
VALUES (@tenant_id, @merchant_id, @quotes_total, @quote_mismatches, @catalog_reads,
  @manipulation_attempts, @refunds_requested, @refunds_honored,
  @cooloff_cancellations, @stock_conflicts, @carts_total, @trust_score, @seq)
ON CONFLICT(tenant_id, merchant_id) DO UPDATE SET
  quotes_total = excluded.quotes_total,
  quote_mismatches = excluded.quote_mismatches,
  catalog_reads = excluded.catalog_reads,
  manipulation_attempts = excluded.manipulation_attempts,
  refunds_requested = excluded.refunds_requested,
  refunds_honored = excluded.refunds_honored,
  cooloff_cancellations = excluded.cooloff_cancellations,
  stock_conflicts = excluded.stock_conflicts,
  carts_total = excluded.carts_total,
  trust_score = excluded.trust_score,
  last_event_seq = excluded.last_event_seq
WHERE merchant_trust.last_event_seq < excluded.last_event_seq`;

/** One event kind's contribution, keyed so `deltaFor` stays a lookup, not a branch ladder. */
type DeltaRule = (payload: EventPayload) => Partial<TrustRow> | null;

const DELTA_RULES: Partial<Record<EventKind, DeltaRule>> = {
  "catalog.quote.received": () => ({ quotesTotal: 1 }),
  "catalog.read": () => ({ catalogReads: 1 }),
  "verdict.emitted": verdictDelta,
  "memory.write.rejected": (payload) =>
    optionalText(payload, "reason_code") === POISONING_REASON
      ? { manipulationAttempts: 1 }
      : null,
  "refund.requested": () => ({ refundsRequested: 1 }),
  "refund.honored": () => ({ refundsHonored: 1 }),
  "cooloff.cancelled": () => ({ cooloffCancellations: 1 }),
  "stock.conflict": () => ({ stockConflicts: 1 }),
};

function verdictDelta(payload: EventPayload): Partial<TrustRow> {
  const mismatch = optionalText(payload, "reason_code") === MISMATCH_REASON;
  return { cartsTotal: 1, quoteMismatches: mismatch ? 1 : 0 };
}

/**
 * `FoldReducer` over the quote / mismatch / manipulation / refund / cooloff
 * events into the `merchant_trust` counters (backend-architecture.md section
 * 2.6, section 3.10). `stock.conflict` is tracked here but never reaches
 * `scoreFor` (section 3.9 decision): losing a fair last-unit race is not
 * merchant misbehaviour.
 *
 * DECISION: `merchant_id` is read defensively from the payload (section
 * 10.3's field lists are non-exhaustive, matching the ledger's own
 * `test-folds.ts`); an event that omits it is consumed but produces no row,
 * rather than corrupting an "unknown" bucket that would mix unrelated
 * merchants' signals together.
 */
export class MerchantTrustFold implements FoldReducer {
  readonly name = "merchant_trust";

  readonly kinds: readonly EventKind[] = [
    "catalog.quote.received",
    "catalog.read",
    "verdict.emitted",
    "memory.write.rejected",
    "refund.requested",
    "refund.honored",
    "cooloff.cancelled",
    "stock.conflict",
  ];

  readonly tables: readonly string[] = ["merchant_trust"];

  apply(db: SqliteDatabase, event: StoredEvent): void {
    const merchantId = optionalText(event.payload, "merchant_id");
    if (merchantId === null) {
      return;
    }
    const delta = DELTA_RULES[event.kind]?.(event.payload) ?? null;
    if (delta === null) {
      return;
    }
    this.persist(db, event, merchantId, delta);
  }

  private persist(
    db: SqliteDatabase,
    event: StoredEvent,
    merchantId: string,
    delta: Partial<TrustRow>,
  ): void {
    const current = this.currentRow(db, event.tenant_id, merchantId);
    const next = mergeRow(current, delta);
    db.prepare(UPSERT_SQL).run({
      tenant_id: event.tenant_id,
      merchant_id: merchantId,
      quotes_total: next.quotesTotal,
      quote_mismatches: next.quoteMismatches,
      catalog_reads: next.catalogReads,
      manipulation_attempts: next.manipulationAttempts,
      refunds_requested: next.refundsRequested,
      refunds_honored: next.refundsHonored,
      cooloff_cancellations: next.cooloffCancellations,
      stock_conflicts: next.stockConflicts,
      carts_total: next.cartsTotal,
      trust_score: scoreFor(next),
      seq: event.seq,
    });
  }

  private currentRow(
    db: SqliteDatabase,
    tenantId: string,
    merchantId: string,
  ): TrustRow {
    const row = db.prepare(SELECT_SQL).get(tenantId, merchantId) as
      | TrustRow
      | undefined;
    return row ?? ZERO_ROW;
  }
}

const COUNTER_KEYS = Object.keys(ZERO_ROW) as readonly (keyof TrustRow)[];

/** A generic field-wise sum, so adding a counter never raises this function's
 * complexity — one more key in `COUNTER_KEYS`, zero new branches. */
function mergeRow(current: TrustRow, delta: Partial<TrustRow>): TrustRow {
  const next: Record<keyof TrustRow, number> = { ...current };
  for (const key of COUNTER_KEYS) {
    next[key] = current[key] + (delta[key] ?? 0);
  }
  return next;
}
