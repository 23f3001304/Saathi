export type SpanAttributeValue = string | number | boolean;

export type SpanAttributes = Readonly<Record<string, SpanAttributeValue>>;

/** A policy rejection is span status `ok` — it is not a system failure (§10.2). */
export type SpanStatus = "ok" | "error";

export interface Span {
  setAttribute(key: string, value: SpanAttributeValue): void;
  setStatus(status: SpanStatus): void;
  recordException(error: Error): void;
  end(): void;
}

/**
 * OTel is ported, not imported, inside packages (decision 3): a `NoopTracer`
 * keeps every package unit-testable and the vendor a composition-root concern.
 */
export interface Tracer {
  startSpan(name: string, attributes: SpanAttributes): Span;
}
