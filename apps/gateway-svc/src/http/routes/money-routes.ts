import { executePaymentRequest, verifyCartRequest } from "@covenant/gateway";
import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppContext, AppEnv } from "../app-env.js";
import { IDEMPOTENT_REPLAY_HEADER } from "../app-env.js";
import { signedBody } from "../middleware/acp-headers.js";
import { drainGuard } from "../middleware/drain-middleware.js";
import { sendReason } from "./reply.js";

/** The demo has a single buyer; the ring names it (ARCHITECTURE §3, §6.7). */
function userIdOf(root: CompositionRoot): string {
  return root.keys.keys.issuerFor("user") ?? "";
}

function replayed(context: AppContext, replay: boolean): void {
  if (replay) {
    context.header(IDEMPOTENT_REPLAY_HEADER, "true");
  }
}

async function verifyCart(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const admitted = context.get("admitted");
  const parsed = verifyCartRequest.safeParse(admitted.parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  const outcome = await root.services.verifyCart.verify({
    body: parsed.data,
    tenantId: parsed.data.tenant_id,
    userId: userIdOf(root),
    requestId: admitted.requestId,
    idempotencyKey: admitted.idempotencyKey,
    payloadHash: admitted.payloadHash,
  });
  if (outcome.status === "conflict") {
    return sendReason(context, root.clock, "IDEMPOTENCY_CONFLICT", outcome.toPass);
  }
  replayed(context, outcome.replay);
  return context.json(outcome.body, 200);
}

async function executePayment(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const admitted = context.get("admitted");
  const parsed = executePaymentRequest.safeParse(admitted.parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  const outcome = await root.services.executePayment.execute({
    body: parsed.data,
    requestId: admitted.requestId,
    idempotencyKey: admitted.idempotencyKey,
    payloadHash: admitted.payloadHash,
  });
  if (outcome.status === "conflict") {
    return sendReason(context, root.clock, "IDEMPOTENCY_CONFLICT", outcome.toPass);
  }
  if (outcome.status === "rejected") {
    return sendReason(context, root.clock, outcome.reasonCode);
  }
  replayed(context, outcome.replay);
  return context.json(outcome.body, 200);
}

/**
 * The two money routes. Both are transport only: validate with the gateway's
 * own zod schemas, hand the command to the service, map the outcome onto §4.6.
 * A policy rejection comes back as a **200 verdict body** with eight seals —
 * a blocked attack is a successful gateway response, and the transport must
 * not relabel it as an error.
 */
export function registerMoney(app: Hono<AppEnv>, root: CompositionRoot): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };
  app.post(
    "/v1/verify-cart",
    drainGuard(root.drain, root.clock),
    signedBody(admission),
    (context) => verifyCart(context, root),
  );
  app.post(
    "/v1/execute-payment",
    drainGuard(root.drain, root.clock),
    signedBody(admission),
    (context) => executePayment(context, root),
  );
}
