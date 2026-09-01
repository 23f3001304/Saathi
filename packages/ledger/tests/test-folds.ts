import type { Database as SqliteDatabase } from "better-sqlite3";

import type { EventKind, StoredEvent } from "@covenant/domain";
import { sha256Hex } from "@covenant/domain";

import type { FoldReducer } from "../src/index.js";

interface QuotePayload {
  readonly merchant_id?: unknown;
  readonly sku_id?: unknown;
  readonly total_paise?: unknown;
  readonly quote_jti?: unknown;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function paise(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/** Rule 1: derived ids are a `sha256(event.id + reducer.name)` prefix. */
function derivedId(event: StoredEvent, reducer: string): string {
  return sha256Hex(`${event.id}${reducer}`).slice(0, 32);
}

const TRUST_SQL = `INSERT INTO merchant_trust
  (tenant_id, merchant_id, quotes_total, catalog_reads, last_event_seq)
VALUES (@tenant_id, @merchant_id, @quotes, @reads, @seq)
ON CONFLICT(tenant_id, merchant_id) DO UPDATE SET
  quotes_total   = merchant_trust.quotes_total  + @quotes,
  catalog_reads  = merchant_trust.catalog_reads + @reads,
  last_event_seq = @seq
WHERE merchant_trust.last_event_seq < @seq`;

/** Counters only — the scoring itself lives in `packages/recs`. */
export class MerchantTrustTestFold implements FoldReducer {
  readonly name = "merchant_trust";
  readonly kinds: readonly EventKind[] = [
    "catalog.quote.received",
    "catalog.read",
  ];
  readonly tables: readonly string[] = ["merchant_trust"];

  apply(db: SqliteDatabase, event: StoredEvent): void {
    const payload = event.payload as QuotePayload;
    const quote = event.kind === "catalog.quote.received";
    db.prepare(TRUST_SQL).run({
      tenant_id: event.tenant_id,
      merchant_id: text(payload.merchant_id, "unknown"),
      quotes: quote ? 1 : 0,
      reads: quote ? 0 : 1,
      seq: event.seq,
    });
  }
}

const PRICE_SQL = `INSERT INTO sku_price_history
  (id, tenant_id, merchant_id, sku_id, price_paise, currency,
   t_valid_from, t_created, tier, attestation_jti, source_event_seq)
VALUES (@id, @tenant_id, @merchant_id, @sku_id, @price, 'INR',
        @ts, @ts, 2, @jti, @seq)
ON CONFLICT(id) DO UPDATE SET
  price_paise      = excluded.price_paise,
  source_event_seq = excluded.source_event_seq`;

export class SkuPriceTestFold implements FoldReducer {
  readonly name = "sku_price_history";
  readonly kinds: readonly EventKind[] = ["catalog.quote.received"];
  readonly tables: readonly string[] = ["sku_price_history"];

  apply(db: SqliteDatabase, event: StoredEvent): void {
    const payload = event.payload as QuotePayload;
    db.prepare(PRICE_SQL).run({
      id: derivedId(event, this.name),
      tenant_id: event.tenant_id,
      merchant_id: text(payload.merchant_id, "unknown"),
      sku_id: text(payload.sku_id, "unknown"),
      price: paise(payload.total_paise),
      ts: event.ts,
      jti: text(payload.quote_jti, "urn:uuid:none"),
      seq: event.seq,
    });
  }
}
