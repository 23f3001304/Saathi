import type { Clock, IdGenerator, Logger } from "@covenant/domain";
import type {
  Span as OtelSpan,
  Tracer as OtelApiTracer,
} from "@opentelemetry/api";
import { SpanKind } from "@opentelemetry/api";
import type { Context, MiddlewareHandler } from "hono";

import type { GatewayConfig } from "../../config.js";
import { OtelSpanAdapter } from "../../obs/otel-tracer.js";
import type { ContextStore } from "../../obs/request-store.js";
import type { AppEnv } from "../app-env.js";
import { API_VERSION_HEADER, REQUEST_ID_HEADER } from "../app-env.js";

export interface ContextDeps {
  readonly config: GatewayConfig;
  readonly logger: Logger;
  readonly otel: OtelApiTracer;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly store: ContextStore;
}

type Next = () => Promise<void>;

type Ctx = Context<AppEnv>;

function tenantOf(header: string | null, fallback: string): string {
  return header === null || header.trim() === "" ? fallback : header.trim();
}

/**
 * Extracts (or mints) the ACP `Request-Id`, opens the SERVER span and seeds
 * AsyncLocalStorage with the ids a judge pivots on (§2.8, §10.2).
 *
 * DECISION: the server span is started through `@opentelemetry/api`'s
 * `startActiveSpan`, not through the injected `Tracer` port. Why: the port
 * deliberately exposes no context propagation, so a span it created would be a
 * root — every `verdict.check.*` and `ledger.transaction` span would land in
 * its own trace and §10.1's tree would never assemble. Making the server span
 * *active* here is what makes the rest of the process's spans its children,
 * and it is also what puts a real `trace_id` on every log line.
 *
 * Minting a `Request-Id` rather than rejecting one is deliberate too: the
 * webhook receiver carries no ACP headers at all, and every reply — including
 * the 400 that `acpHeaders` is about to produce — still has to echo an id the
 * caller can quote back.
 */
export function requestContext(deps: ContextDeps): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    const requestId = context.req.header(REQUEST_ID_HEADER) ?? deps.ids.uuid();
    const tenantId = tenantOf(
      context.req.header("X-Tenant-Id") ?? null,
      deps.config.tenantId,
    );
    context.set("requestId", requestId);
    context.set("tenantId", tenantId);
    context.header(REQUEST_ID_HEADER, requestId);
    context.header(API_VERSION_HEADER, deps.config.apiVersion);
    await deps.otel.startActiveSpan(
      `${context.req.method} ${context.req.path}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.request.method": context.req.method,
          "url.path": context.req.path,
          "covenant.request_id": requestId,
          "covenant.tenant_id": tenantId,
          "covenant.actor": "gateway",
        },
      },
      (span) => run(deps, context, next, span, { requestId, tenantId }),
    );
  };
}

interface Identity {
  readonly requestId: string;
  readonly tenantId: string;
}

async function run(
  deps: ContextDeps,
  context: Ctx,
  next: Next,
  span: OtelSpan,
  identity: Identity,
): Promise<void> {
  const started = deps.clock.now().getTime();
  const spanContext = span.spanContext();
  context.set("span", new OtelSpanAdapter(span));
  try {
    await deps.store.run(
      { ...identity, traceId: spanContext.traceId, spanId: spanContext.spanId },
      next,
    );
  } finally {
    deps.logger.info("http.request", {
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
      ms: deps.clock.now().getTime() - started,
      idempotency_key: context.req.header("Idempotency-Key") ?? null,
    });
    span.end();
  }
}
