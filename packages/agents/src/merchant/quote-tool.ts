import type {
  CartQuoteRef,
  Clock,
  IdGenerator,
  MandateSigner,
  Sha256Ref,
} from "@covenant/domain";
import {
  GATEWAY_AUDIENCE,
  RESERVATION_GRACE_SECONDS,
  sha256RefOf,
} from "@covenant/domain";

import type { MerchantCatalogSource } from "./catalog-source.js";
import type { CatalogSku } from "./demo-catalog.js";
import { findSku } from "./demo-catalog.js";

export const QUOTE_TOOL_NAME = "quote_request";

export interface QuoteRequestArgs {
  readonly sku: string;
  readonly qty: number;
  /** The buyer's ask. Advisory: the floor price is the merchant's answer. */
  readonly target_unit_paise: number | null;
}

export interface QuoteLineItem {
  readonly sku: string;
  readonly qty: number;
  readonly unit_paise: number;
  readonly line_hash: Sha256Ref;
}

export interface QuoteClaims {
  readonly quote_jti: string;
  readonly merchant_id: string;
  readonly sku_id: string;
  readonly total_paise: number;
  /** What the buyer asked for, echoed into what the merchant signed. */
  readonly asked_unit_paise: number | null;
  /** The band this quote was settled inside, as the merchant agent read it. */
  readonly floor_unit_paise: number;
  readonly list_unit_paise: number;
  /**
   * The merchant's own answer about returns, inside their own signature — so a
   * cart that promises refundability rests on an attestation (P2) rather than
   * on an unsigned catalog row. A listing whose seller attests nothing quotes
   * `false`, and a covenant that demanded refundability refuses it.
   */
  readonly refundable: boolean;
  readonly currency: string;
  readonly line_items: readonly QuoteLineItem[];
  readonly lines_hash: Sha256Ref;
  readonly quote_expiry: string;
  readonly reservation_id: string;
  readonly reservation_expires_at: string;
}

export interface IssuedQuote {
  readonly jws: string;
  readonly claims: QuoteClaims;
  /** Exactly what the Cart Mandate binds (§6.3). */
  readonly ref: CartQuoteRef;
}

export interface QuoteToolConfig {
  readonly merchantIss: string;
  readonly merchantId: string;
  readonly ttlSeconds: number;
}

/**
 * An ask below the floor is answered at the floor, not refused. The merchant's
 * answer to "will you take 1500?" is "1700, and that is as low as I go" — and
 * because the ask and the floor both travel in the signed claims, the record
 * says so rather than the buyer having to infer it from a bare number.
 *
 * A floor equal to the listed price is a merchant who declared no discount
 * authority, and this returns the listed price for every ask they receive.
 */
function clampUnit(item: CatalogSku, target: number | null): number {
  if (target === null) {
    return item.listPricePaise;
  }
  return Math.max(item.floorPricePaise, Math.min(item.listPricePaise, target));
}

function lineOf(item: CatalogSku, qty: number, unit: number): QuoteLineItem {
  const line = { sku: item.sku, qty, unit_paise: unit };
  return { ...line, line_hash: sha256RefOf(line) };
}

/**
 * P2 quotes: the merchant's signature is what turns a listed number into a
 * fact the gateway will check a cart against. Every quote carries `jti`, `exp`
 * and per-line hashes, so drip pricing between quote and cart shows up as
 * `CART_QUOTE_MISMATCH` rather than as a surprise on the payment link.
 */
export class QuoteTool {
  constructor(
    private readonly source: MerchantCatalogSource,
    private readonly signer: MandateSigner,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly config: QuoteToolConfig,
  ) {}

  async quote(args: QuoteRequestArgs): Promise<IssuedQuote | null> {
    const item = findSku(await this.source.skus(), args.sku);
    if (item === null || args.qty < 1 || item.stock < args.qty) {
      return null;
    }
    const claims = this.claimsFor(item, args);
    const jws = await this.sign(claims);
    return { jws, claims, ref: refOf(claims) };
  }

  private claimsFor(item: CatalogSku, args: QuoteRequestArgs): QuoteClaims {
    const unit = clampUnit(item, args.target_unit_paise);
    const line = lineOf(item, args.qty, unit);
    const now = this.clock.now().getTime();
    const expiry = new Date(now + this.config.ttlSeconds * 1000);
    return {
      quote_jti: `urn:uuid:${this.ids.uuid()}`,
      merchant_id: this.config.merchantId,
      sku_id: item.sku,
      total_paise: unit * args.qty,
      asked_unit_paise: args.target_unit_paise,
      floor_unit_paise: item.floorPricePaise,
      list_unit_paise: item.listPricePaise,
      refundable: item.refundable,
      currency: item.currency,
      line_items: [line],
      lines_hash: sha256RefOf([line]),
      quote_expiry: expiry.toISOString(),
      reservation_id: `resv_${this.ids.uuid()}`,
      reservation_expires_at: new Date(
        expiry.getTime() + RESERVATION_GRACE_SECONDS * 1000,
      ).toISOString(),
    };
  }

  private sign(claims: QuoteClaims): Promise<string> {
    const seconds = Math.floor(this.clock.now().getTime() / 1000);
    return this.signer.sign(
      {
        ...claims,
        iss: this.config.merchantIss,
        // The merchant quotes on its own behalf; `sub` is required by
        // Es256Verifier, and without it the attestation never reaches P2.
        sub: this.config.merchantIss,
        aud: GATEWAY_AUDIENCE,
        jti: claims.quote_jti,
        iat: seconds,
        exp: seconds + this.config.ttlSeconds,
      },
      "merchant",
    );
  }
}

function refOf(claims: QuoteClaims): CartQuoteRef {
  return {
    quote_jti: claims.quote_jti,
    quote_total_paise: claims.total_paise,
    quote_expiry: claims.quote_expiry,
    reservation_id: claims.reservation_id,
    reservation_expires_at: claims.reservation_expires_at,
  };
}
