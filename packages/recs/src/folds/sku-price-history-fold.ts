import type { Database as SqliteDatabase } from "better-sqlite3";

import type { EventKind, EventPayload, StoredEvent } from "@covenant/domain";
import type { FoldReducer } from "@covenant/ledger";

import { derivedId, numberField, optionalText, textField } from "../fold-support.js";

const CLOSE_PRIOR_SQL = `UPDATE sku_price_history SET t_valid_to = @t_valid_to
  WHERE tenant_id = @tenant_id AND sku_id = @sku_id AND id != @id
    AND t_valid_to IS NULL AND t_valid_from < @t_valid_to`;

const INSERT_SQL = `INSERT INTO sku_price_history
  (id, tenant_id, merchant_id, sku_id, price_paise, currency,
   t_valid_from, t_valid_to, t_created, tier, attestation_jti, source_event_seq)
VALUES (@id, @tenant_id, @merchant_id, @sku_id, @price_paise, @currency,
  @t_valid_from, NULL, @t_created, @tier, @attestation_jti, @source_event_seq)
ON CONFLICT(id) DO NOTHING`;

const DEFAULT_CURRENCY = "INR";
const QUOTE_TIER = 2;
/**
 * DECISION: an approved verdict is a stronger price confirmation than the
 * merchant's own quote (a full mandate chain, user-signed, cleared the
 * pipeline over it), so it is recorded one tier above a bare quote.
 */
const APPROVED_TIER = 3;

interface PricePointDraft {
  readonly merchantId: string;
  readonly skuId: string;
  readonly pricePaise: number;
  readonly attestationJti: string | null;
  readonly tier: number;
}

/**
 * `FoldReducer` over `catalog.quote.received` and `verdict.emitted` (approve
 * only): bi-temporal price rows per SKU (backend-architecture.md section
 * 2.6, section 3.9). A new price point closes the previous open interval for
 * the same `(tenant_id, sku_id)` by stamping its `t_valid_to`, so `points`
 * ordered by `t_valid_from` is a clean, non-overlapping timeline — the shape
 * `PriceAnchorAnalyzer` and the `/folds/prices/:sku` sparkline read.
 *
 * DECISION: section 10.3's "key payload fields" for `verdict.emitted` are
 * `decision, verdicts[], reason_code, human, to_pass, ms` — no per-SKU
 * fields. Rather than invent a dependency on a shape this package does not
 * own, an approve verdict is folded only when its payload additionally
 * carries `sku_id`, `merchant_id` and `total_paise` (the same optional-field
 * pattern the ledger's own `test-folds.ts` uses for `merchant_id`); absent
 * that, the event is consumed (the cursor advances) but produces no row.
 */
export class SkuPriceHistoryFold implements FoldReducer {
  readonly name = "sku_price_history";

  readonly kinds: readonly EventKind[] = [
    "catalog.quote.received",
    "verdict.emitted",
  ];

  readonly tables: readonly string[] = ["sku_price_history"];

  apply(db: SqliteDatabase, event: StoredEvent): void {
    const draft = this.draftFor(event);
    if (draft === null) {
      return;
    }
    this.insertPoint(db, event, draft);
  }

  private draftFor(event: StoredEvent): PricePointDraft | null {
    if (event.kind === "catalog.quote.received") {
      return this.quoteDraft(event.payload);
    }
    return this.approvedDraft(event.payload);
  }

  private quoteDraft(payload: EventPayload): PricePointDraft {
    return {
      merchantId: textField(payload, "merchant_id", "unknown"),
      skuId: textField(payload, "sku_id", "unknown"),
      pricePaise: numberField(payload, "total_paise", 0),
      attestationJti: optionalText(payload, "quote_jti"),
      tier: QUOTE_TIER,
    };
  }

  /** `null` when the verdict is not an approve, or lacks the optional fields. */
  private approvedDraft(payload: EventPayload): PricePointDraft | null {
    if (textField(payload, "decision", "") !== "approve") {
      return null;
    }
    const skuId = optionalText(payload, "sku_id");
    const merchantId = optionalText(payload, "merchant_id");
    if (skuId === null || merchantId === null) {
      return null;
    }
    return {
      merchantId,
      skuId,
      pricePaise: numberField(payload, "total_paise", 0),
      attestationJti: optionalText(payload, "quote_jti"),
      tier: APPROVED_TIER,
    };
  }

  private insertPoint(
    db: SqliteDatabase,
    event: StoredEvent,
    draft: PricePointDraft,
  ): void {
    const id = derivedId(event, this.name);
    const params = {
      id,
      tenant_id: event.tenant_id,
      merchant_id: draft.merchantId,
      sku_id: draft.skuId,
      price_paise: draft.pricePaise,
      currency: DEFAULT_CURRENCY,
      t_valid_from: event.ts,
      t_created: event.ts,
      tier: draft.tier,
      attestation_jti: draft.attestationJti,
      source_event_seq: event.seq,
    };
    db.prepare(CLOSE_PRIOR_SQL).run({
      tenant_id: event.tenant_id,
      sku_id: draft.skuId,
      id,
      t_valid_to: event.ts,
    });
    db.prepare(INSERT_SQL).run(params);
  }
}
