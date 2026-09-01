import type {
  IdempotencyToPass,
  PaymentLink,
  PaymentMandate,
  PaymentRail,
  ReasonCode,
  Sha256Hex,
  Tracer,
} from "@covenant/domain";
import { DomainError, Money } from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";
import type { MandateChainVerifier } from "@covenant/mandates";

import type { ExecutePaymentBracket } from "./execute-payment-bracket.js";
import type { IdempotencyResolver } from "./idempotency-resolver.js";
import type { ReplayOutcome } from "./idempotent-replay.js";
import { replayOf } from "./idempotent-replay.js";
import { orderRequestOf } from "./rail-request.js";
import type {
  ExecutePaymentRequest,
  ExecutePaymentResponse,
} from "./schemas/money-routes.js";
import type { TransactionStore } from "./sql/transaction-store.js";

export interface ExecutePaymentCommand {
  readonly body: ExecutePaymentRequest;
  readonly requestId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: Sha256Hex;
}

export type ExecutePaymentOutcome =
  | {
      readonly status: "ok";
      readonly body: ExecutePaymentResponse;
      readonly replay: boolean;
    }
  | { readonly status: "conflict"; readonly toPass: IdempotencyToPass }
  | { readonly status: "rejected"; readonly reasonCode: ReasonCode };

/**
 * `POST /execute-payment` — **two** transactions bracketing the HTTP call
 * (§5.1). An external effect cannot live inside a database transaction, so this
 * is a transactional outbox with an idempotent effect, and saying so plainly is
 * better than pretending it is atomic.
 *
 * DECISION: the intent side of the bracket is the payment-nonce burn, not the
 * `rzp.order.requested` event §5.1 sketches — `EVENT_KINDS` is frozen and has
 * no such kind. Recovery is unchanged in substance: a burned `payment_execute`
 * nonce with no `rzp.order.created` is exactly the "requested, no outcome"
 * signal, and the retry reuses the same `receipt`, which Razorpay rejects as a
 * duplicate. The mandate is never re-signed.
 */
export class ExecutePaymentService {
  constructor(
    private readonly chain: MandateChainVerifier,
    private readonly rail: PaymentRail,
    private readonly idempotency: IdempotencyResolver,
    private readonly bracket: ExecutePaymentBracket,
    private readonly ledger: LedgerTransaction,
    private readonly transactions: TransactionStore,
    private readonly tracer: Tracer,
  ) {}

  async execute(
    command: ExecutePaymentCommand,
  ): Promise<ExecutePaymentOutcome> {
    const span = this.tracer.startSpan("gateway.execute_payment", {
      tenant: command.body.tenant_id,
    });
    try {
      return await this.run(command);
    } finally {
      span.end();
    }
  }

  private async run(
    command: ExecutePaymentCommand,
  ): Promise<ExecutePaymentOutcome> {
    const verified = await this.chain.verifyPayment(
      command.body.payment_mandate_jwt,
    );
    if (verified.status === "rejected") {
      return { status: "rejected", reasonCode: verified.reasonCode };
    }
    const mandate = verified.value;
    const replayed = replayOf<ExecutePaymentResponse>(this.idempotency, {
      nonce: mandate.jti,
      purpose: "payment_execute",
      tenantId: mandate.tenant_id,
      idempotencyKey: command.idempotencyKey,
      payloadHash: command.payloadHash,
    });
    if (replayed !== null) {
      return outcomeOf(replayed);
    }
    const txn = this.transactions.byCartMandate(mandate.cart_mandate_jti);
    // A held, cancelled or already-executing transaction is answered truthfully.
    if (txn === null || txn.state !== "approved") {
      return { status: "rejected", reasonCode: "TXN_ALREADY_FINALIZED" };
    }
    return this.call(command, mandate, txn.id);
  }

  private async call(
    command: ExecutePaymentCommand,
    mandate: PaymentMandate,
    txnId: string,
  ): Promise<ExecutePaymentOutcome> {
    this.ledger.run("gateway.execute_payment.request", () =>
      this.bracket.request({
        mandate,
        txnId,
        requestId: command.requestId,
        idempotencyKey: command.idempotencyKey,
        payloadHash: command.payloadHash,
      }),
    );
    const amount = Money.fromPaise(mandate.amount, mandate.currency);
    const order = await this.rail.createOrder(orderRequestOf(mandate, amount));
    // Recorded before the link is attempted: the order is an effect that has
    // already happened, and a later failure must not erase it.
    this.ledger.run("gateway.execute_payment.order", () =>
      this.bracket.orderPlaced({ mandate, txnId, order }),
    );
    const link = await this.linkFor(mandate, order.orderId, amount);
    const body = this.ledger.run("gateway.execute_payment.outcome", () =>
      this.bracket.outcome({ mandate, txnId, order, link, amount }),
    );
    return { status: "ok", body, replay: false };
  }

  /**
   * A refused link mint degrades to "no link" rather than failing the whole
   * execution. The order is already live and payable by checkout, so throwing
   * here would throw away a working payment route — and the quota that causes
   * this is a property of the account, not of the purchase. Any other rail
   * failure is still a failure and is rethrown.
   */
  private async linkFor(
    mandate: PaymentMandate,
    orderId: string,
    amount: Money,
  ): Promise<PaymentLink | null> {
    try {
      return await this.rail.createPaymentLink({
        orderId,
        amount,
        referenceId: mandate.jti,
        description: `Covenant ${mandate.jti}`,
      });
    } catch (error) {
      if (
        error instanceof DomainError &&
        error.reasonCode === "RAIL_QUOTA_EXHAUSTED"
      ) {
        return null;
      }
      throw error;
    }
  }
}

/** A burned payment nonce is a policy rejection, not a transport conflict. */
function outcomeOf(
  replayed: ReplayOutcome<ExecutePaymentResponse>,
): ExecutePaymentOutcome {
  switch (replayed.status) {
    case "replay":
      return { status: "ok", body: replayed.body, replay: true };
    case "conflict":
      return { status: "conflict", toPass: replayed.toPass };
    default:
      return { status: "rejected", reasonCode: replayed.reasonCode };
  }
}
