import type {
  EventKind,
  EventSink,
  EventSource,
  PaymentState,
  StoredEvent,
} from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import type { EnvelopeReservationManager } from "./sql/envelope-reservations.js";
import type { TransactionStore } from "./sql/transaction-store.js";

export interface ObservedOutcome {
  readonly txnId: string;
  readonly tenantId: string;
  readonly mandateId: string | null;
  readonly paymentId: string;
  readonly state: PaymentState;
  readonly errorCode: string | null;
  /** Razorpay's `event.id`, when the observation came from a webhook. */
  readonly rzpEventId: string | null;
}

export interface OutcomeApplied {
  readonly applied: boolean;
  readonly reason: string | null;
}

const TERMINAL: Partial<Record<PaymentState, EventKind>> = {
  captured: "payment.captured",
  failed: "payment.failed",
};

/**
 * The one seam where an observed payment outcome becomes ledger truth, shared
 * by the webhook and the poller. §4.8: whichever arrives first wins and the
 * second is deduped on `(txn_id, rzp_payment_id, state)` — two independent
 * paths to the same fact is the point, so the dedupe has to be on the fact and
 * not on which path saw it.
 *
 * The outcome event is appended **before** any state change, and the envelope
 * reservation is captured or released in the same transaction: capacity that
 * was consumed at verify time is settled exactly once (§5.2 c).
 */
export class PaymentOutcomeService {
  constructor(
    private readonly ledger: LedgerTransaction,
    private readonly events: EventSink,
    private readonly source: EventSource,
    private readonly transactions: TransactionStore,
    private readonly envelopes: EnvelopeReservationManager,
  ) {}

  apply(outcome: ObservedOutcome): OutcomeApplied {
    const kind = TERMINAL[outcome.state];
    if (kind === undefined) {
      return { applied: false, reason: "not_terminal" };
    }
    if (this.alreadySeen(outcome, kind)) {
      return { applied: false, reason: "duplicate" };
    }
    return this.ledger.run("gateway.payment_outcome", () =>
      this.record(outcome, kind),
    );
  }

  private record(outcome: ObservedOutcome, kind: EventKind): OutcomeApplied {
    this.events.append({
      tenant_id: outcome.tenantId,
      actor: "razorpay",
      kind,
      txn_id: outcome.txnId,
      request_id: null,
      mandate_id: outcome.mandateId,
      payload: {
        rzp_payment_id: outcome.paymentId,
        rzp_event_id: outcome.rzpEventId,
        state: outcome.state,
        error_code: outcome.errorCode,
      },
    });
    this.transactions.attach(outcome.txnId, "rzp_payment_id", outcome.paymentId);
    this.settleEnvelope(outcome);
    this.transactions.transition(
      outcome.txnId,
      "link_issued",
      outcome.state === "captured" ? "captured" : "failed",
    );
    return { applied: true, reason: null };
  }

  private settleEnvelope(outcome: ObservedOutcome): void {
    const captured = outcome.state === "captured";
    const moved = captured
      ? this.envelopes.capture(outcome.txnId)
      : this.envelopes.release(outcome.txnId);
    if (!moved) {
      return;
    }
    this.events.append({
      tenant_id: outcome.tenantId,
      actor: "gateway",
      kind: captured ? "envelope.captured" : "envelope.released",
      txn_id: outcome.txnId,
      request_id: null,
      mandate_id: outcome.mandateId,
      payload: { txn_id: outcome.txnId },
    });
  }

  private alreadySeen(outcome: ObservedOutcome, kind: EventKind): boolean {
    return this.source
      .byTxn(outcome.txnId)
      .some((event) => matches(event, kind, outcome.paymentId));
  }
}

function matches(
  event: StoredEvent,
  kind: EventKind,
  paymentId: string,
): boolean {
  return (
    event.kind === kind && event.payload["rzp_payment_id"] === paymentId
  );
}
