import type { EventSink, PaymentState } from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import type { PaymentOutcomeService } from "./payment-outcome-service.js";
import type { WebhookResponse } from "./schemas/control-routes.js";
import { webhookRequest } from "./schemas/control-routes.js";
import type { TransactionStore } from "./sql/transaction-store.js";

const OUTCOME_OF: Record<string, PaymentState> = {
  "payment.captured": "captured",
  "payment.failed": "failed",
  "payment_link.paid": "captured",
  "order.paid": "captured",
};

export interface WebhookDelivery {
  readonly rawBody: string;
  /** The exact request bytes, when the transport can supply them; the
   *  signature is checked over these in preference to the decoded string. */
  readonly rawBytes?: Uint8Array;
  readonly signature: string | null;
  readonly tenantId: string;
}

export interface WebhookVerifier {
  verify(rawBody: string | Uint8Array, signature: string | null): boolean;
}

/**
 * Maps a verified webhook into ledger outcome events and deduplicates against
 * the poller (§4.8). A bad signature is `attack.detected` with **no** state
 * change; a good one is applied inside one `LedgerTransaction` and answered
 * within the 5 s Razorpay allows, because a non-2xx makes Razorpay retry and we
 * must not amplify.
 */
export class WebhookService {
  constructor(
    private readonly verifier: WebhookVerifier,
    private readonly outcomes: PaymentOutcomeService,
    private readonly transactions: TransactionStore,
    private readonly events: EventSink,
    private readonly ledger: LedgerTransaction,
  ) {}

  receive(delivery: WebhookDelivery): WebhookResponse {
    if (
      !this.verifier.verify(
        delivery.rawBytes ?? delivery.rawBody,
        delivery.signature,
      )
    ) {
      this.reject(delivery);
      return { ok: true, applied: false, reason: "WEBHOOK_SIGNATURE_INVALID" };
    }
    const parsed = webhookRequest.safeParse(safeJson(delivery.rawBody));
    if (!parsed.success) {
      return { ok: true, applied: false, reason: "unrecognised_event" };
    }
    return this.applyEvent(delivery, parsed.data);
  }

  private applyEvent(
    delivery: WebhookDelivery,
    event: { event: string; payload: Record<string, unknown> },
  ): WebhookResponse {
    const state = OUTCOME_OF[event.event];
    const payment = paymentEntityOf(event.payload);
    if (state === undefined || payment === null) {
      return { ok: true, applied: false, reason: "unrecognised_event" };
    }
    const txn = this.transactions.byOrder(payment.orderId);
    if (txn === null) {
      return { ok: true, applied: false, reason: "unknown_transaction" };
    }
    const applied = this.outcomes.apply({
      txnId: txn.id,
      tenantId: delivery.tenantId,
      mandateId: txn.payment_mandate_id,
      paymentId: payment.id,
      state,
      errorCode: payment.errorCode,
      rzpEventId: payment.eventId,
    });
    return { ok: true, applied: applied.applied, reason: applied.reason };
  }

  /** A forged webhook changes nothing and is ledgered as what it is (§4.8). */
  private reject(delivery: WebhookDelivery): void {
    this.ledger.run("gateway.webhook.rejected", () => {
      this.events.append({
        tenant_id: delivery.tenantId,
        actor: "attacker",
        kind: "webhook.rejected",
        txn_id: null,
        request_id: null,
        mandate_id: null,
        payload: { reason_code: "WEBHOOK_SIGNATURE_INVALID" },
      });
    });
  }
}

interface PaymentEntity {
  readonly id: string;
  readonly orderId: string;
  readonly errorCode: string | null;
  readonly eventId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function paymentEntityOf(
  payload: Record<string, unknown>,
): PaymentEntity | null {
  const entity = asRecord(asRecord(payload["payment"])?.["entity"]);
  if (entity === null || typeof entity["id"] !== "string") {
    return null;
  }
  const orderId = entity["order_id"];
  const errorCode = entity["error_code"];
  return {
    id: entity["id"],
    orderId: typeof orderId === "string" ? orderId : "",
    errorCode: typeof errorCode === "string" ? errorCode : null,
    eventId: null,
  };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
