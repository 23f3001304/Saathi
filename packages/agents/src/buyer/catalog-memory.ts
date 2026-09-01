import type { ActionClass, Clock, SourceChannel } from "@covenant/domain";

import type { GatewayClient, GatewayResult } from "./gateway-client.js";
import type {
  MemoryRetrieveResponse,
  MemoryWriteResponse,
} from "./gateway-schemas.js";

export interface CatalogFact {
  readonly sku: string;
  readonly merchantId: string;
  /** Merchant prose. It is evidence of what was said, not of what is true. */
  readonly description: string;
  readonly pricePaise: number;
  readonly currency: string;
}

export interface QuoteFact {
  readonly sku: string;
  readonly merchantId: string;
  readonly quoteJti: string;
  readonly totalPaise: number;
  /** The buyer's single ask, as the merchant signed it back. */
  readonly askedUnitPaise: number | null;
  readonly currency: string;
  readonly expiry: string;
  readonly reservationId: string;
  /** The merchant's compact JWS — the whole reason this lands as P2. */
  readonly attestation: string;
}

export interface CatalogMemoryConfig {
  readonly userId: string;
  readonly tenantId: string;
}

/**
 * PTLM integration. The agent never decides a tier: it declares the channel a
 * fact arrived on and the gateway's write gate derives the tier from it. That
 * is why a poisoned catalog description can be written down safely — it is
 * recorded as `untrusted_text`, quarantined at P0, and structurally excluded
 * from `cart-construction` retrievals.
 */
export class CatalogMemoryWriter {
  constructor(
    private readonly gateway: GatewayClient,
    private readonly clock: Clock,
    private readonly config: CatalogMemoryConfig,
  ) {}

  writeCatalogFact(
    fact: CatalogFact,
  ): Promise<GatewayResult<MemoryWriteResponse>> {
    return this.write({
      type: "fact",
      tier_claim: "P0",
      source_channel: "untrusted_text",
      sig: null,
      subject: fact.sku,
      predicate: "listing",
      source_ref: `${fact.merchantId}:${fact.sku}`,
      content: {
        description: fact.description,
        listed_price_paise: fact.pricePaise,
        currency: fact.currency,
        merchant_id: fact.merchantId,
      },
    });
  }

  writeQuoteFact(fact: QuoteFact): Promise<GatewayResult<MemoryWriteResponse>> {
    return this.write({
      type: "fact",
      tier_claim: "P2",
      source_channel: "merchant_attestation",
      sig: fact.attestation,
      subject: fact.sku,
      predicate: "price",
      source_ref: fact.quoteJti,
      content: {
        quote_jti: fact.quoteJti,
        sku_id: fact.sku,
        total_paise: fact.totalPaise,
        asked_unit_paise: fact.askedUnitPaise,
        currency: fact.currency,
        quote_expiry: fact.expiry,
        reservation_id: fact.reservationId,
        merchant_id: fact.merchantId,
      },
    });
  }

  retrieve(
    query: string,
    actionClass: ActionClass,
    limit: number,
  ): Promise<GatewayResult<MemoryRetrieveResponse>> {
    return this.gateway.retrieveMemory({
      query,
      action_class: actionClass,
      limit,
      as_of: null,
      user_id: this.config.userId,
    });
  }

  private write(fields: {
    type: string;
    tier_claim: string;
    source_channel: SourceChannel;
    sig: string | null;
    subject: string;
    predicate: string;
    source_ref: string;
    content: Readonly<Record<string, unknown>>;
  }): Promise<GatewayResult<MemoryWriteResponse>> {
    return this.gateway.writeMemory({
      ...fields,
      t_valid: this.clock.now().toISOString(),
      t_invalid: null,
      user_id: this.config.userId,
    });
  }
}
