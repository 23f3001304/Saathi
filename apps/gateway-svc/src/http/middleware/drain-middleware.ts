import type { Clock } from "@covenant/domain";
import type { MiddlewareHandler } from "hono";

import type { DrainGate } from "../../shutdown.js";
import type { AppEnv } from "../app-env.js";
import { replyFor } from "../error-envelope.js";

/**
 * Guards the money surface only. Reads stay available through the drain — the
 * audit UI watching the last verdicts land is exactly what a judge is doing
 * when the process is asked to stop.
 */
export function drainGuard(
  gate: DrainGate,
  clock: Clock,
): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    if (gate.isDraining) {
      const reply = replyFor("GATEWAY_DRAINING", context.get("requestId"), clock);
      return context.json(reply.body, reply.status as 503);
    }
    gate.enter();
    try {
      await next();
    } finally {
      gate.exit();
    }
    return undefined;
  };
}
