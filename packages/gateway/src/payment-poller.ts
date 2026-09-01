import type {
  Clock,
  EventSink,
  Logger,
  PaymentRail,
  PaymentSnapshot,
  PaymentState,
  Tracer,
} from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import type {
  ObservedOutcome,
  PaymentOutcomeService,
} from "./payment-outcome-service.js";

/** §4.8: every 3 s for up to 5 min per open transaction. */
export const DEFAULT_POLL = { intervalMs: 3_000, timeoutMs: 300_000 } as const;

export interface PollConfig {
  readonly intervalMs: number;
  readonly timeoutMs: number;
}

export type Sleep = (ms: number) => Promise<void>;

/**
 * The order, not a payment id. A transaction sitting at `link_issued` has no
 * payment id — nobody has paid — so a poller keyed on one could never take its
 * first look. The order exists from the moment the bracket closes, and both
 * ways to pay it (the hosted link and the embedded checkout) book their
 * payment against it, so the order is the handle that always exists.
 */
export interface PollTarget {
  readonly txnId: string;
  readonly tenantId: string;
  readonly mandateId: string | null;
  readonly orderId: string;
}

const TERMINAL: readonly PaymentState[] = ["captured", "failed", "refunded"];

/** A paid attempt outranks a live one, which outranks a dead one. */
const RANK: Record<PaymentState, number> = {
  captured: 4,
  refunded: 3,
  authorized: 2,
  created: 1,
  failed: 0,
};

/**
 * Razorpay books one payment per attempt, so a shopper who mistypes a card and
 * retries leaves a `failed` beside a `captured`. Reporting the newest would
 * make the answer depend on arrival order; reporting the best-ranked reports
 * what actually happened to the money.
 */
export function bestPayment(
  payments: readonly PaymentSnapshot[],
): PaymentSnapshot | null {
  let best: PaymentSnapshot | null = null;
  for (const payment of payments) {
    if (best === null || RANK[payment.state] > RANK[best.state]) {
      best = payment;
    }
  }
  return best;
}

function isSettled(snapshot: PaymentSnapshot | null): boolean {
  return snapshot !== null && TERMINAL.includes(snapshot.state);
}

/**
 * The independent second outcome path. It exists because a webhook that never
 * arrives must not leave a transaction open forever, and because two paths that
 * agree are evidence — every observed state change is appended, and the
 * dedupe in `PaymentOutcomeService` decides which path got there first.
 */
export class PaymentPoller {
  constructor(
    private readonly rail: PaymentRail,
    private readonly outcomes: PaymentOutcomeService,
    private readonly events: EventSink,
    private readonly ledger: LedgerTransaction,
    private readonly clock: Clock,
    private readonly sleep: Sleep,
    private readonly logger: Logger,
    private readonly tracer: Tracer,
    private readonly config: PollConfig = DEFAULT_POLL,
  ) {}

  /** `null` when the window closed with the order still unpaid. */
  async poll(target: PollTarget): Promise<PaymentSnapshot | null> {
    const span = this.tracer.startSpan("gateway.payment_poll", {
      txn: target.txnId,
    });
    try {
      return await this.until(target);
    } finally {
      span.end();
    }
  }

  private async until(target: PollTarget): Promise<PaymentSnapshot | null> {
    const deadline = this.clock.now().getTime() + this.config.timeoutMs;
    let latest = await this.observe(target);
    while (!isSettled(latest) && this.clock.now().getTime() < deadline) {
      await this.sleep(this.config.intervalMs);
      latest = await this.observe(target);
    }
    return latest;
  }

  /**
   * No change still costs one `rzp.polled` line: the audit trail shows we
   * looked. An unpaid order is appended too — "we looked and nobody had paid"
   * is a fact about the transaction, and a gap in the trail would be
   * indistinguishable from never having looked.
   */
  private async observe(target: PollTarget): Promise<PaymentSnapshot | null> {
    const snapshot = bestPayment(
      await this.rail.paymentsForOrder(target.orderId),
    );
    this.append(target, snapshot);
    const applied =
      snapshot === null
        ? null
        : this.outcomes.apply(toOutcome(target, snapshot));
    this.logger.debug("gateway.payment_poll", {
      txn_id: target.txnId,
      state: snapshot?.state ?? "unpaid",
      applied: applied?.applied ?? false,
    });
    return snapshot;
  }

  private append(target: PollTarget, snapshot: PaymentSnapshot | null): void {
    this.ledger.run("gateway.payment_poll.observe", () => {
      this.events.append({
        tenant_id: target.tenantId,
        actor: "gateway",
        kind: "rzp.polled",
        txn_id: target.txnId,
        request_id: null,
        mandate_id: target.mandateId,
        payload: {
          rzp_order_id: target.orderId,
          rzp_payment_id: snapshot?.paymentId ?? null,
          state: snapshot?.state ?? "unpaid",
        },
      });
    });
  }
}

function toOutcome(
  target: PollTarget,
  snapshot: PaymentSnapshot,
): ObservedOutcome {
  return {
    txnId: target.txnId,
    tenantId: target.tenantId,
    mandateId: target.mandateId,
    paymentId: snapshot.paymentId,
    state: snapshot.state,
    errorCode: snapshot.errorCode,
    rzpEventId: null,
  };
}
