import type {
  Span,
  SpanAttributeValue,
  SpanAttributes,
  SpanStatus,
  Tracer,
} from "@covenant/domain";
import type { Span as OtelSpan, Tracer as OtelApiTracer } from "@opentelemetry/api";
import { SpanStatusCode } from "@opentelemetry/api";

import type { ContextStore } from "./request-store.js";

/**
 * A policy rejection is `Status.OK` with `covenant.decision = reject`; only a
 * 5xx condition sets `ERROR` (§10.2). A blocked attack is a successful gateway
 * response, and colouring Jaeger red for it would make the error rate a
 * measure of how well the system is working.
 */
export class OtelSpanAdapter implements Span {
  constructor(private readonly span: OtelSpan) {}

  setAttribute(key: string, value: SpanAttributeValue): void {
    this.span.setAttribute(key, value);
  }

  setStatus(status: SpanStatus): void {
    this.span.setStatus({
      code: status === "ok" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
    });
  }

  recordException(error: Error): void {
    this.span.recordException(error);
  }

  end(): void {
    this.span.end();
  }
}

/**
 * The `Tracer` port over `@opentelemetry/api` (§2.8). Every span carries the
 * §10.2 first block — `covenant.request_id`, `covenant.tenant_id`,
 * `covenant.actor` — without any call site having to pass them.
 */
export class OtelTracer implements Tracer {
  constructor(
    private readonly tracer: OtelApiTracer,
    private readonly store: ContextStore,
  ) {}

  startSpan(name: string, attributes: SpanAttributes): Span {
    const current = this.store.getStore();
    return new OtelSpanAdapter(
      this.tracer.startSpan(name, {
        attributes: {
          "covenant.request_id": current?.requestId ?? "",
          "covenant.tenant_id": current?.tenantId ?? "",
          "covenant.actor": "gateway",
          ...attributes,
        },
      }),
    );
  }
}
