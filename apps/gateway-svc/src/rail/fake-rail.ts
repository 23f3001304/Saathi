import type {
  Clock,
  OrderRef,
  OrderRequest,
  PaymentLink,
  PaymentLinkRequest,
  PaymentRail,
  PaymentSnapshot,
} from "@covenant/domain";
import { Money, sha256Hex } from "@covenant/domain";

/**
 * `COVENANT_RAIL=fake`: a deterministic in-process rail so the whole system
 * boots, demos and is attack-tested with no Razorpay credentials (§10.4's
 * "one command" claim). It is not a stub that returns constants — every id is
 * derived from the receipt, which is the Payment Mandate `jti`, so the
 * duplicate-receipt property the §5.1 bracket relies on for crash recovery
 * holds here too: the same mandate always yields the same order id.
 *
 * DECISION: the fake settles to `captured` on `getPayment` rather than
 * `created`. Why: the demo's terminal state has to be reachable without a
 * human opening a payment link, and the poller/webhook paths both converge on
 * `captured` — a fake that never settles would make the happy path untestable
 * end to end, which is the one thing the fake exists for.
 */
export class FakePaymentRail implements PaymentRail {
  private readonly orders = new Map<string, OrderRef>();

  private readonly looks = new Map<string, number>();

  constructor(private readonly clock: Clock) {}

  createOrder(request: OrderRequest): Promise<OrderRef> {
    const existing = this.orders.get(request.receipt);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    const order: OrderRef = {
      orderId: `order_fake_${token(request.receipt)}`,
      amount: request.amount,
      receipt: request.receipt,
    };
    this.orders.set(request.receipt, order);
    return Promise.resolve(order);
  }

  createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLink> {
    const id = token(request.referenceId);
    return Promise.resolve({
      linkId: `plink_fake_${id}`,
      shortUrl: `https://rzp.local/fake/${id}`,
    });
  }

  getPayment(paymentId: string): Promise<PaymentSnapshot> {
    void this.clock.now();
    return Promise.resolve({
      paymentId,
      orderId: null,
      state: "captured",
      amount: Money.fromPaise(0, "INR"),
      errorCode: null,
    });
  }

  /**
   * The first look answers "nobody has paid yet" and every look after it
   * answers `captured`. Both halves are deliberate: an order that was paid the
   * instant it existed would make the bill's waiting state unreachable and so
   * untestable, and a fake that never settled would break the one thing the
   * fake exists for (§10.4's "one command", no human at a payment page).
   */
  paymentsForOrder(orderId: string): Promise<readonly PaymentSnapshot[]> {
    const looks = (this.looks.get(orderId) ?? 0) + 1;
    this.looks.set(orderId, looks);
    if (looks < 2) {
      return Promise.resolve([]);
    }
    return Promise.resolve([
      {
        paymentId: `pay_fake_${token(orderId)}`,
        orderId,
        state: "captured",
        amount: Money.fromPaise(0, "INR"),
        errorCode: null,
      },
    ]);
  }
}

function token(seed: string): string {
  return sha256Hex(seed).slice(0, 14);
}
