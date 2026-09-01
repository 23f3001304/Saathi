import { epochSeconds, mintJti, signCompact } from "../crypto/jws.js";
import type { Harness } from "../harness.js";
import type { IssuedCart, QuoteRef } from "../mandates/cart-mandate.js";
import { issueCart } from "../mandates/cart-mandate.js";
import type { BoundsSpec, IssuedMandate } from "../mandates/intent-mandate.js";
import { issueIntent } from "../mandates/intent-mandate.js";
import type { CartSpec } from "../mandates/payment-request.js";
import { totalPaiseOf } from "../mandates/payment-request.js";
import { GATEWAY_AUDIENCE } from "../protocol.js";
import type { Retrieval } from "./memory.js";
import { retrieveMemory, writeMemory } from "./memory.js";

const HOUR_MS = 3_600_000;

export interface PurchaseSpec {
  /** Its own memory namespace, so one scenario cannot contaminate the next. */
  readonly userId: string;
  readonly cart: CartSpec;
  readonly bounds: BoundsSpec;
  readonly description: string;
  readonly quoteTotalPaise?: number;
  readonly quoteTtlMs?: number;
  readonly cartTtlSeconds?: number;
  readonly extensionUri?: string;
  readonly cartJti?: string;
}

export interface Prepared {
  readonly intent: IssuedMandate;
  readonly cart: IssuedCart;
  readonly quote: QuoteRef;
  readonly retrieval: Retrieval;
  readonly body: Readonly<Record<string, unknown>>;
}

/** A merchant price attestation: the JWS that buys a `merchant_attestation` P2. */
function attestation(harness: Harness, now: Date): { jwt: string; jti: string } {
  const iat = epochSeconds(now);
  const jti = mintJti();
  const merchant = harness.merchantIss;
  return {
    jti,
    jwt: signCompact(harness.ring, "merchant", {
      iss: merchant,
      sub: merchant,
      aud: GATEWAY_AUDIENCE,
      iat,
      exp: iat + 3600,
      jti,
    }),
  };
}

/**
 * `QuoteMatchCheck` resolves the comparand **from memory, by `quote_jti`** —
 * never from the cart body being checked (§8.2). So the honest merchant path
 * is: attest the price into memory at P2 first, then sign a cart that agrees
 * with it. A re-quote after a TTL expiry is exactly this, run twice.
 */
async function seedQuote(
  harness: Harness,
  spec: PurchaseSpec,
  now: Date,
): Promise<QuoteRef> {
  const signed = attestation(harness, now);
  const line = spec.cart.lines[0];
  const quote: QuoteRef = {
    quote_jti: mintJti(),
    quote_total_paise: spec.quoteTotalPaise ?? totalPaiseOf(spec.cart.lines),
    quote_expiry: new Date(now.getTime() + (spec.quoteTtlMs ?? HOUR_MS)).toISOString(),
    reservation_id: `rsv_${signed.jti.slice(-12)}`,
    reservation_expires_at: new Date(
      now.getTime() + (spec.quoteTtlMs ?? HOUR_MS),
    ).toISOString(),
  };
  await writeMemory(harness, {
    type: "fact",
    tierClaim: "P2",
    content: {
      quote_jti: quote.quote_jti,
      sku_id: line?.sku ?? "",
      total_paise: quote.quote_total_paise,
      quote_expiry: quote.quote_expiry,
      reservation_id: quote.reservation_id,
    },
    channel: "merchant_attestation",
    sourceRef: signed.jti,
    sig: signed.jwt,
    subject: line?.sku ?? null,
    predicate: "price",
    userId: spec.userId,
  });
  return quote;
}

function cartFor(
  harness: Harness,
  spec: PurchaseSpec,
  intent: IssuedMandate,
  retrieval: Retrieval,
  quote: QuoteRef,
  now: Date,
): IssuedCart {
  return issueCart(harness.ring, {
    tenantId: harness.tenantId,
    cart: spec.cart,
    intentJti: intent.jti,
    intentJwtHash: intent.jwtHash,
    memoryDigest: retrieval.digest,
    memoryEntryIds: retrieval.entryIds,
    quote,
    agentInstanceId: harness.agentUrn,
    ttlSeconds: spec.cartTtlSeconds ?? 900,
    issuedAt: now,
    ...(spec.extensionUri === undefined ? {} : { extensionUri: spec.extensionUri }),
    ...(spec.cartJti === undefined ? {} : { jti: spec.cartJti }),
  });
}

/** Seed → retrieve → sign intent → sign cart: the honest agent's whole path. */
export async function preparePurchase(
  harness: Harness,
  spec: PurchaseSpec,
  now: Date = new Date(),
): Promise<Prepared> {
  const quote = await seedQuote(harness, spec, now);
  const retrieval = await retrieveMemory(
    harness,
    spec.userId,
    "cart-construction",
    "the item this user is buying",
  );
  const intent = issueIntent(harness.ring, {
    tenantId: harness.tenantId,
    description: spec.description,
    agentInstanceId: harness.agentUrn,
    bounds: spec.bounds,
    issuedAt: now,
  });
  const cart = cartFor(harness, spec, intent, retrieval, quote, now);
  return {
    intent,
    cart,
    quote,
    retrieval,
    body: {
      cart_mandate_jwt: cart.jwt,
      intent_mandate_jwt: intent.jwt,
      memory_entry_ids: [...retrieval.entryIds],
      tenant_id: harness.tenantId,
    },
  };
}
