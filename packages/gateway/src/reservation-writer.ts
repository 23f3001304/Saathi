import type { EventKind, IdGenerator, StoredEvent } from "@covenant/domain";
import { toIsoTimestamp } from "@covenant/domain";

import { periodKeyOf } from "./sql/period-key.js";
import type { SettlementInput, SettlementPorts } from "./settlement-types.js";
import {
  dominantCategory,
  periodOf,
  reservationExpiryOf,
} from "./settlement-types.js";

export type Appender = (
  kind: EventKind,
  payload: Record<string, unknown>,
) => StoredEvent;

/**
 * The two capacity claims of §5.2 c and d. Both are "event first, row second",
 * so the row's `event_id` foreign key always points at the append that
 * justified it — and a rolled-back savepoint takes both away together.
 */
export class ReservationWriter {
  constructor(
    private readonly ports: SettlementPorts,
    private readonly ids: IdGenerator,
  ) {}

  /**
   * The merchant mints one `reservation_id` per unit; it is this table's primary
   * key, so the second cart to claim it takes the constraint and becomes
   * `STOCK_CONFLICT` (§5.2 d).
   */
  claimStock(input: SettlementInput, append: Appender): void {
    const context = input.context;
    const quote = context.cart.quote;
    const skuId = context.signedQuote?.sku_id ?? quote.quote_jti;
    const event = append("stock.reservation.claimed", {
      reservation_id: quote.reservation_id,
      sku_id: skuId,
      quote_jti: quote.quote_jti,
    });
    this.ports.stock.claim({
      reservationId: quote.reservation_id,
      tenantId: context.tenantId,
      merchantId: context.merchantAuth.merchantIss,
      skuId,
      qty: 1,
      quoteJti: quote.quote_jti,
      cartMandateId: context.cart.jti,
      expiresAt: quote.reservation_expires_at,
      eventId: event.id,
    });
  }

  /**
   * DECISION: one reservation row per transaction, because `UNIQUE(txn_id)`
   * permits exactly one (§3.8). A multi-category cart therefore reserves its
   * whole total against its dominant category — the conservative reading, since
   * the alternative is to under-reserve a cap.
   */
  reserveEnvelope(input: SettlementInput, append: Appender): void {
    const context = input.context;
    const category = dominantCategory(context);
    if (category === null) {
      return;
    }
    const event = append("envelope.reserved", {
      category,
      amount_paise: context.cartTotal.paise,
    });
    this.ports.envelopes.reserve({
      id: `rsv_${this.ids.uuid()}`,
      tenantId: context.tenantId,
      userId: context.userId,
      category,
      periodKey: periodKeyOf(periodOf(context, category), context.now),
      amountPaise: context.cartTotal.paise,
      txnId: context.txnId,
      cartMandateId: context.cart.jti,
      createdAt: toIsoTimestamp(context.now),
      expiresAt: reservationExpiryOf(context),
      eventId: event.id,
    });
  }
}
