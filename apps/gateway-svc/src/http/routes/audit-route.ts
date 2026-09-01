import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppEnv } from "../app-env.js";
import { readHeaders } from "../middleware/acp-headers.js";
import { positiveInt, sendReason } from "./reply.js";

const DEFAULT_LANE_LIMIT = 100;

const MAX_LANE_LIMIT = 500;

/**
 * `GET /audit/:txn_id` is the causal chain of one purchase (§4.12);
 * `GET /audit?lane=attacks` is the cold-load backfill for the attack lane —
 * live arrivals come over the same SSE stream every other frame does, because
 * a separate alert channel would make the most important moment in the demo
 * the one thing that is not provable from the chain (§4.11).
 */
export function registerAudit(app: Hono<AppEnv>, root: CompositionRoot): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };

  app.get("/v1/audit", readHeaders(admission), (context) => {
    const limit = positiveInt(
      context.req.query("limit"),
      DEFAULT_LANE_LIMIT,
      MAX_LANE_LIMIT,
    );
    return context.json({
      items: root.read.lanes.attacks(context.get("tenantId"), limit),
    });
  });

  app.get("/v1/audit/:txn_id", readHeaders(admission), (context) => {
    const body = root.read.audit.assemble(context.req.param("txn_id") ?? "");
    if (body === null) {
      return sendReason(context, root.clock, "SCHEMA_VIOLATION");
    }
    return context.json(body, 200);
  });
}
