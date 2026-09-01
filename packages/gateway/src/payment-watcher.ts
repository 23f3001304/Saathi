import type { Logger } from "@covenant/domain";

import type { PaymentPoller, PollTarget } from "./payment-poller.js";

/**
 * What actually starts the poller. `PaymentPoller` is a loop with a deadline;
 * something has to decide when to run one, and until now nothing did — the
 * class was constructed nowhere, so a transaction that reached `link_issued`
 * had exactly one route to an outcome (the webhook) and §4.8's "two
 * independent paths" was one path.
 *
 * `ensure` is idempotent per transaction and deliberately re-armable: the poll
 * window is five minutes, a shopper is not, and the gateway may restart in
 * between. Both gaps close the same way — whoever is watching the bill asks
 * again, and a transaction with no live watch gets a fresh one. There is no
 * boot-time scan because the read itself is the trigger, which also means the
 * rail is only polled while a human is actually waiting on the answer.
 */
export class PaymentWatcher {
  private readonly watching = new Set<string>();

  constructor(
    private readonly poller: PaymentPoller,
    private readonly logger: Logger,
  ) {}

  /** `true` when this call started a watch, `false` when one was already up. */
  ensure(target: PollTarget): boolean {
    if (this.watching.has(target.txnId)) {
      return false;
    }
    this.watching.add(target.txnId);
    void this.run(target);
    return true;
  }

  get active(): number {
    return this.watching.size;
  }

  private async run(target: PollTarget): Promise<void> {
    try {
      await this.poller.poll(target);
    } catch (error) {
      // A rail that is down must not wedge the watch: the entry is released in
      // `finally`, so the next read starts a fresh look rather than believing
      // a dead one is still running.
      this.logger.warn("gateway.payment_watch.failed", {
        txn_id: target.txnId,
        error: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      this.watching.delete(target.txnId);
    }
  }
}
