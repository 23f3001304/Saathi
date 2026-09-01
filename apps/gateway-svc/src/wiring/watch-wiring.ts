import type { Clock, PaymentRail } from "@covenant/domain";
import type { PaymentOutcomeService } from "@covenant/gateway";
import { PaymentPoller, PaymentWatcher } from "@covenant/gateway";

import type { ObsParts } from "./obs-wiring.js";
import type { StoreParts } from "./store-wiring.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/**
 * The second outcome path, finally switched on. It has its own wiring file
 * rather than a few more lines in `service-wiring.ts` only because that file
 * is at its line budget; the ordering it belongs to is unchanged — the poller
 * needs the same `PaymentOutcomeService` the webhook uses, which is the point
 * of §4.8's dedupe.
 */
export function wireWatcher(
  rail: PaymentRail,
  outcomes: PaymentOutcomeService,
  stores: StoreParts,
  obs: ObsParts,
  clock: Clock,
): PaymentWatcher {
  return new PaymentWatcher(
    new PaymentPoller(
      rail,
      outcomes,
      stores.events,
      stores.ledger,
      clock,
      sleep,
      obs.logger,
      obs.tracer,
    ),
    obs.logger,
  );
}
