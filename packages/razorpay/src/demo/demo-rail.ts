import {
  DomainError,
  Money,
  type Clock,
  type OrderRef,
  type OrderRequest,
  type PaymentLink,
  type PaymentLinkRequest,
  type PaymentState,
  type PaymentRail,
  type PaymentSnapshot,
} from "@covenant/domain";
import { SCENARIO_SCRIPTS, type DemoScenario } from "./demo-scenarios.js";

/** The scripted state for a poll; the last state repeats once reached. */
function stateAt(states: readonly PaymentState[], step: number): PaymentState {
  return states[Math.min(step, states.length - 1)] ?? "created";
}

export interface DemoRailConfig {
  readonly scenario: DemoScenario;
  /** Honest surface for the UI: a demo rail must announce itself. */
  readonly label?: string;
}

interface DemoOrder {
  readonly orderId: string;
  readonly amount: Money;
  polls: number;
}

/**
 * A PaymentRail that moves no money and says so. Same contract as the real
 * adapter, deterministic outcomes, real latency — so a demo can show a
 * decline and a stall, not only a success.
 *
 * It is deliberately NOT a silent stand-in for Razorpay: `label` exists so
 * every surface showing a payment can state that this one was simulated.
 */
export class DemoRail implements PaymentRail {
  private readonly orders = new Map<string, DemoOrder>();
  private sequence = 0;

  constructor(
    private readonly clock: Clock,
    private readonly config: DemoRailConfig,
  ) {}

  get label(): string {
    return this.config.label ?? "Demo rail — no money moves";
  }

  async createOrder(request: OrderRequest): Promise<OrderRef> {
    const script = SCENARIO_SCRIPTS[this.config.scenario];
    if (script.failsAtOrder === true) {
      // The human sentence comes from the frozen reason catalogue; the demo
      // does not get to invent its own error copy.
      throw new DomainError("RAZORPAY_UNAVAILABLE");
    }
    const orderId = this.nextId("order");
    this.orders.set(orderId, {
      orderId,
      amount: request.amount,
      polls: 0,
    });
    return { orderId, amount: request.amount, receipt: request.receipt };
  }

  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink> {
    const linkId = this.nextId("plink");
    return {
      linkId,
      // A demo link points at nothing real, and its host says as much. The
      // reference rides along so a journal entry still traces to its mandate.
      shortUrl: `https://demo.saathi.local/pay/${linkId}?ref=${encodeURIComponent(request.referenceId)}`,
    };
  }

  async getPayment(paymentId: string): Promise<PaymentSnapshot> {
    const script = SCENARIO_SCRIPTS[this.config.scenario];
    const { order, step } = this.advance(paymentId);
    await this.wait(script.pollDelayMs);
    const state = stateAt(script.states, step);

    return {
      paymentId,
      orderId: order?.orderId ?? null,
      state,
      amount: order?.amount ?? Money.fromPaise(0, "INR"),
      errorCode: state === "failed" ? script.errorCode : null,
    };
  }

  /**
   * The scripted rail books one payment per order the moment the order exists,
   * so the scenario's `created → …` script is what a watcher observes. A
   * scenario whose first state is `created` is the "link opened, nothing paid
   * yet" rehearsal, which is the case the order lookup exists to serve.
   */
  async paymentsForOrder(orderId: string): Promise<readonly PaymentSnapshot[]> {
    if (!this.orders.has(orderId)) return [];
    const snapshot = await this.getPayment(orderId);
    return [{ ...snapshot, paymentId: `pay_demo_${orderId}`, orderId }];
  }

  /** Each poll advances the scripted state for that order by one step. */
  private advance(paymentId: string): {
    order: DemoOrder | null;
    step: number;
  } {
    const order = this.orders.get(paymentId) ?? this.firstOrder();
    if (order === null) return { order: null, step: 0 };
    const step = order.polls;
    order.polls += 1;
    return { order, step };
  }

  private firstOrder(): DemoOrder | null {
    const first = this.orders.values().next();
    return first.done === true ? null : first.value;
  }

  private nextId(prefix: string): string {
    this.sequence += 1;
    const stamp = this.clock.now().getTime().toString(36);
    return `${prefix}_demo${stamp}${this.sequence}`;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
