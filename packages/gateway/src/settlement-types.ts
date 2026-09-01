import type { EnvelopePeriod, TimedVerdict } from "@covenant/domain";
import { RESERVATION_GRACE_SECONDS, categoryDrawPaise } from "@covenant/domain";

import type { EnvelopeReservationManager } from "./sql/envelope-reservations.js";
import type { MandateRowDraft, MandateStore } from "./sql/mandate-store.js";
import type { StockReservationManager } from "./sql/stock-reservations.js";
import type { TransactionStore } from "./sql/transaction-store.js";
import type { DecisionResult } from "./verdict-decision.js";
import type { VerdictContext } from "./verdict-context.js";
import type { IssuedPaymentMandate } from "./verify-cart-response.js";

/** The four projection writers the commit phase touches, grouped as one seam. */
export interface SettlementPorts {
  readonly envelopes: EnvelopeReservationManager;
  readonly mandates: MandateStore;
  readonly transactions: TransactionStore;
  readonly stock: StockReservationManager;
}

export interface SettlementInput {
  readonly context: VerdictContext;
  readonly verdicts: readonly TimedVerdict[];
  readonly result: DecisionResult;
  readonly mandate: IssuedPaymentMandate;
  readonly intentJwt: string;
  readonly cartJwt: string;
  readonly holdUntil: string | null;
  /** Stored on the burn and replayed verbatim on an identical retry (§4.5). */
  readonly responseJson: string;
}

/** Thrown where a `PRIMARY KEY (nonce, purpose)` violation would land. */
export class NonceAlreadyBurned extends Error {
  readonly code = "SQLITE_CONSTRAINT_PRIMARYKEY";

  constructor() {
    super("UNIQUE constraint failed: nonces.nonce, nonces.purpose");
    this.name = "NonceAlreadyBurned";
  }
}

export function dominantCategory(context: VerdictContext): string | null {
  const categories = [...new Set(context.cartLines.map((l) => l.category))];
  return categories.reduce<string | null>(
    (best, category) =>
      best === null ||
      categoryDrawPaise(context.cartLines, category) >
        categoryDrawPaise(context.cartLines, best)
        ? category
        : best,
    null,
  );
}

export function periodOf(
  context: VerdictContext,
  category: string,
): EnvelopePeriod {
  return (
    context.envelopes.find((envelope) => envelope.category === category)
      ?.period ?? "month"
  );
}

/** Reservations expire at cart-mandate `exp` + 10 minutes (decision 14). */
export function reservationExpiryOf(context: VerdictContext): string {
  return new Date(
    Date.parse(context.cart.exp) + RESERVATION_GRACE_SECONDS * 1000,
  ).toISOString();
}

/**
 * `transactions.cart_mandate_id` is a foreign key into `mandates`, so the whole
 * presented chain is materialised in one pass. Every row points at the single
 * `mandate.issued` event that justified the write, which keeps the projection
 * from ever being ahead of the ledger it is derived from.
 */
export function mandateDraftsOf(
  input: SettlementInput,
  eventId: string,
): readonly MandateRowDraft[] {
  const intent = input.context.intent;
  return [
    {
      ...common(intent.tenant_id, eventId, intent.kid, intent.iat, intent.exp),
      id: intent.jti,
      kind: "intent",
      vcJwt: input.intentJwt,
      jwtHash: intent.jwtHash,
      status: "verified",
      parentId: null,
      memoryDigest: null,
      cartHash: null,
    },
    ...cartAndPaymentDrafts(input, eventId),
  ];
}

function cartAndPaymentDrafts(
  input: SettlementInput,
  eventId: string,
): readonly MandateRowDraft[] {
  const { intent, cart } = input.context;
  const shared = {
    ...common(cart.tenant_id, eventId, cart.kid, cart.iat, cart.exp),
    memoryDigest: cart.memory_digest,
    cartHash: cart.cart_hash,
  };
  return [
    {
      ...shared,
      id: cart.jti,
      kind: "cart",
      vcJwt: input.cartJwt,
      jwtHash: cart.jwtHash,
      status: "verified",
      parentId: intent.jti,
    },
    {
      ...shared,
      id: input.mandate.jti,
      kind: "payment",
      vcJwt: input.mandate.jwt,
      jwtHash: input.mandate.jwtHash,
      status: input.result.decision === "hold" ? "held" : "issued",
      parentId: cart.jti,
    },
  ];
}

function common(
  tenantId: string,
  createdEventId: string,
  issuerKid: string,
  iat: string,
  exp: string,
) {
  return { tenantId, createdEventId, issuerKid, iat, exp };
}
