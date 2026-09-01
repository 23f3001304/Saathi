import type {
  Clock,
  EventSink,
  Money,
  NonceRegistry,
  OrderRef,
  PaymentLink,
  PaymentMandate,
  Sha256Hex,
} from "@covenant/domain";
import { DomainError, toIsoTimestamp } from "@covenant/domain";

import type { ExecutePaymentResponse } from "./schemas/money-routes.js";
import type { NonceResponseStore } from "./sql/sqlite-nonce-registry.js";
import type { TransactionStore } from "./sql/transaction-store.js";

export interface BracketRequest {
  readonly mandate: PaymentMandate;
  readonly txnId: string;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: Sha256Hex;
}

export interface BracketOutcome {
  readonly mandate: PaymentMandate;
  readonly txnId: string;
  readonly order: OrderRef;
  /** `null` when the rail refused to mint one; the order is still payable. */
  readonly link: PaymentLink | null;
  readonly amount: Money;
}

export interface BracketOrder {
  readonly mandate: PaymentMandate;
  readonly txnId: string;
  readonly order: OrderRef;
}

/**
 * The two ledger halves that bracket the Razorpay call (§5.1). Each runs inside
 * its own `BEGIN IMMEDIATE`; the HTTP call happens between them, where no
 * transaction is open, because an external effect inside a transaction is the
 * one thing the atomicity claim cannot survive.
 */
export class ExecutePaymentBracket {
  constructor(
    private readonly events: EventSink,
    private readonly nonces: NonceRegistry,
    private readonly responses: NonceResponseStore,
    private readonly transactions: TransactionStore,
    private readonly clock: Clock,
  ) {}

  /** Intent side: the burn is the durable record that the call is about to go out. */
  request(input: BracketRequest): void {
    const mandate = input.mandate;
    const event = this.events.append({
      tenant_id: mandate.tenant_id,
      actor: "gateway",
      kind: "nonce.burned",
      txn_id: input.txnId,
      request_id: input.requestId,
      mandate_id: mandate.jti,
      payload: { nonce: mandate.jti, purpose: "payment_execute" },
    });
    const burned = this.nonces.burn({
      nonce: mandate.jti,
      purpose: "payment_execute",
      tenantId: mandate.tenant_id,
      payloadHash: input.payloadHash,
      idempotencyKey: input.idempotencyKey,
      burnedAt: toIsoTimestamp(this.clock.now()),
      burnEventId: event.id,
      // Rewritten by `outcome`; the burn has to exist before the call goes out.
      responseJson: JSON.stringify({ pending: true, txn_id: input.txnId }),
    });
    if (burned.status !== "burned") {
      throw new DomainError("NONCE_BURNED");
    }
  }

  /**
   * The order, recorded the moment it exists and before the link is attempted.
   *
   * It used to be written only in `outcome`, together with the link — so a
   * refused link mint threw past both, and a **real Razorpay order that had
   * already been created** left no trace in the ledger at all. That is the one
   * kind of fact this system may not drop: an external effect that happened.
   * Recording it here also leaves the transaction payable by checkout when no
   * link can be minted.
   */
  orderPlaced(input: BracketOrder): void {
    this.events.append({
      tenant_id: input.mandate.tenant_id,
      actor: "razorpay",
      kind: "rzp.order.created",
      txn_id: input.txnId,
      request_id: null,
      mandate_id: input.mandate.jti,
      payload: {
        rzp_order_id: input.order.orderId,
        receipt: input.order.receipt,
      },
    });
    this.transactions.attach(input.txnId, "rzp_order_id", input.order.orderId);
  }

  /** Outcome side: the link if there is one, then the guarded state move. */
  outcome(input: BracketOutcome): ExecutePaymentResponse {
    const link = input.link;
    if (link !== null) {
      this.events.append({
        tenant_id: input.mandate.tenant_id,
        actor: "razorpay",
        kind: "rzp.link.created",
        txn_id: input.txnId,
        request_id: null,
        mandate_id: input.mandate.jti,
        payload: {
          rzp_payment_link_id: link.linkId,
          short_url: link.shortUrl,
        },
      });
      this.transactions.attach(input.txnId, "rzp_payment_link_id", link.linkId);
    }
    // `link_issued` is the state's name for "the rail is now waiting to be
    // paid for this transaction", which is true with or without a link. The
    // honest signal that no link exists is `payment_link: null`, not a state.
    this.transactions.transition(input.txnId, "approved", "link_issued");
    const body: ExecutePaymentResponse = {
      ok: true,
      txn_id: input.txnId,
      rzp_order_id: input.order.orderId,
      payment_link: link?.shortUrl ?? null,
      amount: input.amount.paise,
      currency: input.amount.currency,
      state: "link_issued",
    };
    this.responses.recordResponse(
      input.mandate.jti,
      "payment_execute",
      JSON.stringify(body),
    );
    return body;
  }
}
