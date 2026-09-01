import { cooloffActionRequest } from "@covenant/gateway";
import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppContext, AppEnv } from "../app-env.js";
import { readHeaders, signedBody } from "../middleware/acp-headers.js";
import { drainGuard } from "../middleware/drain-middleware.js";
import { sendReason } from "./reply.js";

type Move = "cancel" | "restore";

/** `:id` is the **hold id**, which is the cart mandate `jti` — not the txn id. */
function act(
  context: AppContext,
  root: CompositionRoot,
  move: Move,
): Response {
  const admitted = context.get("admitted");
  const parsed = cooloffActionRequest.safeParse(admitted.parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  const holdId = context.req.param("id") ?? "";
  const outcome =
    move === "cancel"
      ? root.services.cooloff.cancel(holdId, parsed.data.reason)
      : root.services.cooloff.restore(holdId);
  if (outcome.status === "lost") {
    return sendReason(context, root.clock, outcome.reasonCode, outcome.toPass);
  }
  return context.json(outcome.body, 200);
}

/**
 * One-tap cancel and the 5 s undo (§5.2 e). Both are a single guarded
 * `UPDATE`: losing the race to a maturity timer answers `TXN_ALREADY_FINALIZED`
 * truthfully rather than accepting a cancel a webhook would contradict.
 *
 * The signature may be the user's **or** the agent's (§4.1) — a cancel only
 * ever removes authority, so widening who may ask for one costs nothing.
 */
export function registerCooloff(app: Hono<AppEnv>, root: CompositionRoot): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };
  app.get("/v1/cooloff", readHeaders(admission), (context) =>
    context.json(root.read.transactions.cooloffDock(context.get("tenantId"))),
  );
  app.post(
    "/v1/cooloff/:id/cancel",
    drainGuard(root.drain, root.clock),
    signedBody(admission),
    (context) => act(context, root, "cancel"),
  );
  app.post(
    "/v1/cooloff/:id/restore",
    drainGuard(root.drain, root.clock),
    signedBody(admission),
    (context) => act(context, root, "restore"),
  );
}
