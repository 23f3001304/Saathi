import type { Clock, PaymentRail } from "@covenant/domain";
import {
  RazorpayClient,
  RazorpayErrorMapper,
  RazorpayPaymentRail,
  RetryPolicy,
} from "@covenant/razorpay";

import type { GatewayConfig } from "../config.js";
import { FakePaymentRail } from "../rail/fake-rail.js";
import type { ObsParts } from "./obs-wiring.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/**
 * The single money egress, chosen once at boot. `COVENANT_RAIL=fake` is not a
 * test double bolted on from outside — it is the same `PaymentRail` port the
 * live adapter implements, so the whole system, its attack harness and its
 * ledger behave identically with and without Razorpay credentials (§10.4).
 */
export function wireRail(
  config: GatewayConfig,
  obs: ObsParts,
  clock: Clock,
): PaymentRail {
  if (config.rail === "fake") {
    obs.logger.warn("rail.fake", { reason: "COVENANT_RAIL=fake or no key id" });
    return new FakePaymentRail(clock);
  }
  return new RazorpayPaymentRail(
    new RazorpayClient(
      config.razorpay,
      fetch,
      new RetryPolicy(clock, sleep),
      clock,
      obs.logger,
      obs.tracer,
      new RazorpayErrorMapper(),
    ),
  );
}
