import type { Clock, ItemCatalog } from "@covenant/domain";
import {
  RazorpayClient,
  RazorpayErrorMapper,
  RazorpayItemCatalog,
  RetryPolicy,
} from "@covenant/razorpay";

import type { GatewayConfig } from "../config.js";
import type { ObsParts } from "./obs-wiring.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/**
 * The merchant's live inventory, or `null` when there are no Razorpay keys.
 *
 * `null` is not a degraded mode — it is the offline floor: the merchant route
 * answers from the frozen demo catalog instead, so a clone with no secrets
 * still serves a whole shop.
 *
 * Note what this deliberately does *not* follow: `config.rail`. The rail is
 * about money egress and `COVENANT_RAIL=fake` is how an operator says "do not
 * charge anything". Listing items charges nothing, so a keyed operator running
 * the fake rail still sees their real shelf.
 */
export function wireItems(
  config: GatewayConfig,
  obs: ObsParts,
  clock: Clock,
): ItemCatalog | null {
  if (config.razorpay.keyId === "" || config.razorpay.keySecret === "") {
    obs.logger.warn("merchant.items.fixture_floor", {
      reason: "no Razorpay key id or secret",
    });
    return null;
  }
  return new RazorpayItemCatalog(
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
