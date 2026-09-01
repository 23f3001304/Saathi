import { covenantSignRequest } from "@covenant/gateway";
import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppContext, AppEnv } from "../app-env.js";
import { readHeaders, signedBody } from "../middleware/acp-headers.js";
import { drainGuard } from "../middleware/drain-middleware.js";
import { commitIntent } from "./covenant-commit.js";
import { sendReason } from "./reply.js";

async function sign(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const admitted = context.get("admitted");
  const parsed = covenantSignRequest.safeParse(admitted.parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  const verified = await root.keys.chain.verifyIntent(
    parsed.data.intent_mandate_jwt,
  );
  if (verified.status === "rejected") {
    return sendReason(context, root.clock, verified.reasonCode, verified.toPass);
  }
  const body = await commitIntent(
    root,
    verified.value,
    parsed.data.intent_mandate_jwt,
    admitted.requestId,
  );
  return context.json(body, 200);
}

/**
 * `GET /covenant` is the signing sheet's read model: the bounds the user
 * actually signed, taken from the `intent.signed` ledger event, plus the live
 * P3 constraints those bounds created. `POST /covenant/sign` is pinned to the
 * **user** key — an agent-signed covenant would be the agent granting itself
 * authority, which is the one thing the three-keypair split exists to stop.
 */
export function registerCovenant(app: Hono<AppEnv>, root: CompositionRoot): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };
  app.get("/v1/covenant", readHeaders(admission), (context) => {
    const tenantId = context.get("tenantId");
    const bounds = root.read.lanes.latestBounds(tenantId);
    const constraints = root.read.lanes.browse(
      tenantId,
      "constraint-evaluation",
      100,
    );
    return context.json({
      constraints: constraints.map((entry) => ({
        id: entry.id,
        predicate: entry.predicate,
        content: entry.content,
      })),
      envelopes: bounds["envelopes"] ?? [],
      cooloff_rules: bounds["cooloff"] ?? null,
      merchants: bounds["merchants"] ?? [],
      skus: bounds["skus"] ?? [],
    });
  });
  app.post(
    "/v1/covenant/sign",
    drainGuard(root.drain, root.clock),
    signedBody(admission, ["user"]),
    (context) => sign(context, root),
  );
}
