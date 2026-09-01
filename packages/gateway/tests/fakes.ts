import type {
  Clock,
  IdGenerator,
  LedgerFrame,
  LogFields,
  Logger,
  MemoryEntry,
  MemoryStore,
  OrderRef,
  OrderRequest,
  PaymentLink,
  PaymentLinkRequest,
  PaymentRail,
  PaymentSnapshot,
  Span,
  Tracer,
} from "@covenant/domain";
import { Money } from "@covenant/domain";
import type { FramePublisher } from "@covenant/ledger";

import type { Timer, TimerFactory } from "../src/index.js";

/** Injected fakes, not a mocking framework (ARCHITECTURE §12-D). */
export class FixedClock implements Clock {
  constructor(private instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime());
  }

  set(instant: Date): void {
    this.instant = instant;
  }

  advance(ms: number): void {
    this.instant = new Date(this.instant.getTime() + ms);
  }
}

export class CountingIds implements IdGenerator {
  private next = 0;

  uuid(): string {
    this.next += 1;
    return `00000000-0000-4000-8000-${this.next.toString(16).padStart(12, "0")}`;
  }
}

class NoopSpan implements Span {
  setAttribute(): void {}
  setStatus(): void {}
  recordException(): void {}
  end(): void {}
}

export class NoopTracer implements Tracer {
  startSpan(): Span {
    return new NoopSpan();
  }
}

export class SilentLogger implements Logger {
  readonly lines: { evt: string; fields: LogFields }[] = [];

  debug(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }
  info(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }
  warn(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }
  error(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }
  fatal(evt: string, fields: LogFields): void {
    this.lines.push({ evt, fields });
  }
}

export class RecordingPublisher implements FramePublisher {
  readonly batches: (readonly LedgerFrame[])[] = [];

  publish(frames: readonly LedgerFrame[]): void {
    this.batches.push(frames);
  }

  get frames(): readonly LedgerFrame[] {
    return this.batches.flat();
  }
}

/**
 * `packages/memory` is built in parallel and the gateway may not import it, so
 * the store arrives through the domain port and the suite injects this.
 */
export class FakeMemoryStore implements MemoryStore {
  private readonly rows = new Map<string, MemoryEntry>();

  put(entry: MemoryEntry): void {
    this.rows.set(entry.id, entry);
  }

  getByIds(tenantId: string, ids: readonly string[]): readonly MemoryEntry[] {
    return ids
      .map((id) => this.rows.get(id))
      .filter((entry): entry is MemoryEntry => entry !== undefined)
      .filter((entry) => entry.tenantId === tenantId);
  }

  liveConstraints(): readonly MemoryEntry[] {
    return [...this.rows.values()].filter(
      (entry) => entry.type === "constraint" && entry.tExpired === null,
    );
  }

  invalidate(): void {}

  search(): Promise<readonly MemoryEntry[]> {
    return Promise.resolve([...this.rows.values()]);
  }
}

export class FakePaymentRail implements PaymentRail {
  readonly orders: OrderRequest[] = [];
  readonly links: PaymentLinkRequest[] = [];
  snapshot: PaymentSnapshot | null = null;

  createOrder(request: OrderRequest): Promise<OrderRef> {
    this.orders.push(request);
    return Promise.resolve({
      orderId: `order_${this.orders.length}`,
      amount: request.amount,
      receipt: request.receipt,
    });
  }

  createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink> {
    this.links.push(request);
    return Promise.resolve({
      linkId: `plink_${this.links.length}`,
      shortUrl: `https://rzp.io/i/${this.links.length}`,
    });
  }

  getPayment(paymentId: string): Promise<PaymentSnapshot> {
    return Promise.resolve(this.snapshot ?? captured(paymentId));
  }

  /** `orderPayments` left empty is the "nobody has paid yet" case under test. */
  orderPayments: PaymentSnapshot[] | null = null;

  paymentsForOrder(orderId: string): Promise<readonly PaymentSnapshot[]> {
    return Promise.resolve(
      this.orderPayments ?? [this.snapshot ?? captured(`pay_for_${orderId}`)],
    );
  }
}

function captured(paymentId: string): PaymentSnapshot {
  return {
    paymentId,
    orderId: null,
    state: "captured",
    amount: Money.fromPaise(0, "INR"),
    errorCode: null,
  };
}

/** Timers fire only when the test says so — no wall clock in the suite. */
export class ManualTimers implements TimerFactory {
  private readonly pending: (() => void)[] = [];

  after(ms: number, run: () => void): Timer {
    void ms;
    this.pending.push(run);
    const index = this.pending.length - 1;
    return {
      cancel: () => {
        this.pending[index] = () => {};
      },
    };
  }

  fireAll(): void {
    const due = [...this.pending];
    this.pending.length = 0;
    for (const run of due) {
      run();
    }
  }
}
