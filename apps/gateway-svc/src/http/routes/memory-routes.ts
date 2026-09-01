import type { ActionClass } from "@covenant/domain";
import { ACTION_CLASSES, parseTier } from "@covenant/domain";
import { memoryRetrieveRequest, memoryWriteRequest } from "@covenant/gateway";
import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppContext, AppEnv } from "../app-env.js";
import { readHeaders, signedBody } from "../middleware/acp-headers.js";
import { drainGuard } from "../middleware/drain-middleware.js";
import {
  browseViewOf,
  candidateOf,
  retrievalBodyOf,
  writeBodyOf,
} from "./memory-views.js";
import { positiveInt, sendReason } from "./reply.js";

const DEFAULT_BROWSE_LIMIT = 50;

const MAX_BROWSE_LIMIT = 200;

function actionClassOf(raw: string | undefined): ActionClass {
  return ACTION_CLASSES.includes(raw as ActionClass)
    ? (raw as ActionClass)
    : "chat";
}

async function write(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const admitted = context.get("admitted");
  const parsed = memoryWriteRequest.safeParse(admitted.parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  const result = await root.memory.writeGate.submit(
    candidateOf(
      parsed.data,
      parseTier(parsed.data.tier_claim),
      admitted.requestId,
    ),
  );
  // A rejected write is a 200 with its rule and reason (§4.6, memory_write).
  return context.json(writeBodyOf(result), 200);
}

async function retrieve(
  context: AppContext,
  root: CompositionRoot,
): Promise<Response> {
  const admitted = context.get("admitted");
  const parsed = memoryRetrieveRequest.safeParse(admitted.parsedBody);
  if (!parsed.success) {
    return sendReason(context, root.clock, "SCHEMA_VIOLATION");
  }
  const body = parsed.data;
  const retrieval = await root.memory.readGate.retrieve({
    tenantId: body.tenant_id,
    userId: body.user_id,
    query: body.query,
    actionClass: body.action_class,
    limit: body.limit,
    asOf: body.as_of,
    conversationId: body.conversation_id ?? null,
  });
  return context.json(retrievalBodyOf(retrieval), 200);
}

/**
 * `POST /memory/write` submits to the write gate; `POST /memory/retrieve` is
 * the **only** digest-minting path; `GET /memory` browses and returns no
 * digest field at all — a digest obtainable outside a cart context would be
 * cacheable and linkable, and it must be minted only in the act of building
 * the cart it will be signed into (§4.10).
 */
export function registerMemory(app: Hono<AppEnv>, root: CompositionRoot): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };
  app.post(
    "/v1/memory/write",
    drainGuard(root.drain, root.clock),
    signedBody(admission),
    (context) => write(context, root),
  );
  app.post("/v1/memory/retrieve", signedBody(admission), (context) =>
    retrieve(context, root),
  );
  app.get("/v1/memory", readHeaders(admission), (context) => {
    const query = context.req.query();
    const entries = root.read.lanes.browse(
      context.get("tenantId"),
      actionClassOf(query["action_class"]),
      positiveInt(query["limit"], DEFAULT_BROWSE_LIMIT, MAX_BROWSE_LIMIT),
    );
    return context.json({ entries: entries.map(browseViewOf) }, 200);
  });
}
