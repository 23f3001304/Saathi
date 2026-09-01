import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppEnv } from "../app-env.js";
import { readHeaders } from "../middleware/acp-headers.js";
import { positiveInt } from "./reply.js";

const DEFAULT_LIMIT = 10;

const MAX_LIMIT = 50;

/**
 * `GET /recs` (§4.10). The flywheel reads the ledger and never influences a
 * verdict, so this route is a plain projection: `k_anonymity` travels in the
 * body because a suppressed aggregate has to be visible as suppressed rather
 * than silently absent.
 */
export function registerRecs(app: Hono<AppEnv>, root: CompositionRoot): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };
  app.get("/v1/recs", readHeaders(admission), async (context) => {
    const service = root.recs;
    if (service === null) {
      // TODO: one-line swap in `recs-wiring`; the branch stays so a build
      // without the flywheel still boots the rest of the gateway.
      return context.json({ ok: false, reason_code: "NOT_IMPLEMENTED" }, 501);
    }
    const query = context.req.query();
    return context.json(
      await service.recommend({
        tenantId: context.get("tenantId"),
        userId: query["user_id"] ?? root.keys.keys.issuerFor("user") ?? "",
        category: query["category"] ?? null,
        limit: positiveInt(query["limit"], DEFAULT_LIMIT, MAX_LIMIT),
      }),
      200,
    );
  });
}
