import type { Clock, PaymentRail, PaymentSnapshot, PaymentState } from "@covenant/domain";
import type { Sleep } from "./retry-policy.js";

export interface PollConfig {
  readonly intervalMs: number;
  readonly timeoutMs: number;
}

/** §4.8: "runs every 3 s for up to 5 min per open transaction." */
export const DEFAULT_POLL_CONFIG: PollConfig = {
  intervalMs: 3_000,
  timeoutMs: 300_000,
};

const TERMINAL_STATES: readonly PaymentState[] = ["captured", "failed", "refunded"];

/**
 * DECISION: the design (§2.4) places `PaymentPoller` inside `packages/gateway`
 * as a class holding `EventSink`/`EventSource` (it ledgers every observed
 * state change). This package cannot depend on `ledger`, so it exports only
 * the polling primitive: repeat `getPayment` on a cadence until a terminal
 * state or the timeout, handing every observed snapshot to `onSnapshot`.
 * `packages/gateway`'s future `PaymentPoller` wraps this with ledger appends
 * and dedupe against the webhook path (§4.8's "whichever arrives first wins").
 *
 * A pure function, not a class, per the design doc's carve-out (§0): no
 * injected state to hold between calls, so there is nothing a constructor
 * would buy over parameters.
 */
export async function pollPaymentOutcome(
  rail: PaymentRail,
  paymentId: string,
  clock: Clock,
  sleep: Sleep,
  onSnapshot: (snapshot: PaymentSnapshot) => void,
  config: PollConfig = DEFAULT_POLL_CONFIG,
): Promise<PaymentSnapshot> {
  const deadline = clock.now().getTime() + config.timeoutMs;
  let latest = await rail.getPayment(paymentId);
  onSnapshot(latest);
  while (!isTerminal(latest.state) && clock.now().getTime() < deadline) {
    await sleep(config.intervalMs);
    latest = await rail.getPayment(paymentId);
    onSnapshot(latest);
  }
  return latest;
}

function isTerminal(state: PaymentState): boolean {
  return TERMINAL_STATES.includes(state);
}
