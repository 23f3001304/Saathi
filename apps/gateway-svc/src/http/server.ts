import { Hono } from "hono";
import { cors } from "hono/cors";

import type { CompositionRoot } from "../composition-root.js";
import type { AppEnv } from "./app-env.js";
import { replyForThrown } from "./error-envelope.js";
import { requestContext } from "./middleware/request-context.js";
import { otelMiddleware } from "./middleware/otel-middleware.js";
import { registerAudit } from "./routes/audit-route.js";
import { registerCooloff } from "./routes/cooloff-route.js";
import { registerCovenant } from "./routes/covenant-route.js";
import { registerFolds } from "./routes/folds-route.js";
import { registerHealth } from "./routes/health-route.js";
import { registerLedger } from "./routes/ledger-route.js";
import { registerMemory } from "./routes/memory-routes.js";
import { registerMerchant } from "./routes/merchant-route.js";
import { registerMerchantInsight } from "./routes/merchant-insight-route.js";
import { registerMoney } from "./routes/money-routes.js";
import { registerRecs } from "./routes/recs-route.js";
import { registerWebhook } from "./routes/webhook-route.js";
import { sendEnvelope } from "./routes/reply.js";

const REGISTRARS = [
  registerHealth,
  registerMoney,
  registerMemory,
  registerCovenant,
  registerCooloff,
  registerLedger,
  registerAudit,
  registerFolds,
  registerMerchant,
  registerMerchantInsight,
  registerRecs,
  registerWebhook,
] as const;

/**
 * Middleware chain, then routes (§2.8). Every handler here is transport only:
 * it validates with the gateway package's own zod schemas, delegates to a
 * service, and maps the outcome onto §4.6. No policy decision is taken in this
 * directory, and no `BEGIN IMMEDIATE` is held across an `await` — the services
 * own their transactions and the transport never opens one (§5.1).
 */
/**
 * The audit UI is served from its own origin, so every read it makes — /readyz,
 * /v1/*, and the SSE stream — is cross-origin. Without this the browser can
 * reach the gateway and still see nothing. Reads are public by design (the
 * ledger is the product); writes stay gated by the ACP signature, which an
 * origin header cannot forge.
 */
function browserReads(): ReturnType<typeof cors> {
  return cors({
    origin: "*",
    allowHeaders: [
      "content-type",
      "Request-Id",
      "Idempotency-Key",
      "Signature",
      "Timestamp",
      "API-Version",
      "Last-Event-ID",
    ],
  });
}

export function buildServer(root: CompositionRoot): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", browserReads());
  app.use(
    "*",
    requestContext({
      config: root.config,
      logger: root.obs.logger,
      otel: root.obs.otel.tracer,
      clock: root.clock,
      ids: root.ids,
      store: root.obs.store,
    }),
  );
  app.use("*", otelMiddleware());
  app.onError((cause, context) => {
    root.obs.logger.error("http.unhandled", {
      path: context.req.path,
      cause: cause.message,
    });
    return sendEnvelope(
      context,
      replyForThrown(cause, context.get("requestId"), root.clock),
    );
  });
  for (const register of REGISTRARS) {
    register(app, root);
  }
  return app;
}
