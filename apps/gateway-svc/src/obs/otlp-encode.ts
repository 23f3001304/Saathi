import type { AttributeValue, Attributes, HrTime } from "@opentelemetry/api";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-node";

/**
 * OTLP/HTTP **JSON** encoding (opentelemetry-proto `trace/v1`), hand-written.
 *
 * DECISION: the gateway encodes OTLP itself instead of depending on
 * `@opentelemetry/exporter-trace-otlp-http`. Why: that package pulls
 * `protobufjs`, whose install script pnpm refuses to run without an
 * `allowBuilds` entry in the root workspace file — and this task may not edit
 * root config. Jaeger's collector accepts OTLP/JSON on `/v1/traces`, the
 * encoding is a fixed wire format, and ~80 lines here is cheaper than a
 * dependency that makes `pnpm install` exit non-zero on a fresh clone.
 */
export interface KeyValue {
  readonly key: string;
  readonly value: Readonly<Record<string, unknown>>;
}

function anyValue(value: AttributeValue): Readonly<Record<string, unknown>> {
  if (typeof value === "string") {
    return { stringValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value)
      ? { intValue: String(value) }
      : { doubleValue: value };
  }
  return {
    arrayValue: {
      values: value.map((item) => anyValue(item ?? "")),
    },
  };
}

export function keyValues(attributes: Attributes): readonly KeyValue[] {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ key, value: anyValue(value as AttributeValue) }));
}

/** `[seconds, nanos]` → the uint64 nanosecond string OTLP/JSON wants. */
export function unixNano(time: HrTime): string {
  return String(BigInt(time[0]) * 1_000_000_000n + BigInt(time[1]));
}

/**
 * The JS `SpanKind` enum starts at `INTERNAL = 0`; the proto reserves 0 for
 * `SPAN_KIND_UNSPECIFIED`, so every value shifts by one.
 */
function spanKind(kind: number): number {
  return kind + 1;
}

function encodeSpan(span: ReadableSpan): Readonly<Record<string, unknown>> {
  const context = span.spanContext();
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    ...(span.parentSpanContext === undefined
      ? {}
      : { parentSpanId: span.parentSpanContext.spanId }),
    name: span.name,
    kind: spanKind(span.kind),
    startTimeUnixNano: unixNano(span.startTime),
    endTimeUnixNano: unixNano(span.endTime),
    attributes: keyValues(span.attributes),
    droppedAttributesCount: span.droppedAttributesCount,
    status: { code: span.status.code },
  };
}

function scopeGroups(
  spans: readonly ReadableSpan[],
): readonly Readonly<Record<string, unknown>>[] {
  const byScope = new Map<string, ReadableSpan[]>();
  for (const span of spans) {
    const name = span.instrumentationScope.name;
    const bucket = byScope.get(name) ?? [];
    bucket.push(span);
    byScope.set(name, bucket);
  }
  return [...byScope].map(([name, group]) => ({
    scope: { name, version: group[0]?.instrumentationScope.version ?? "" },
    spans: group.map(encodeSpan),
  }));
}

/**
 * One `resourceSpans` entry per distinct resource. The gateway runs a single
 * tracer provider, so in practice that is always exactly one.
 */
export function encodeTraces(spans: readonly ReadableSpan[]): unknown {
  if (spans.length === 0) {
    return { resourceSpans: [] };
  }
  return {
    resourceSpans: [
      {
        resource: { attributes: keyValues(spans[0]?.resource.attributes ?? {}) },
        scopeSpans: scopeGroups(spans),
      },
    ],
  };
}
