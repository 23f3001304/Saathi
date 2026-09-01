import type {
  Clock,
  Logger,
  Span,
  SpanAttributes,
  SpanAttributeValue,
  SpanStatus,
  Tracer,
} from "@covenant/domain";

class LogSpan implements Span {
  private readonly attributes: Record<string, SpanAttributeValue>;
  private status: SpanStatus = "ok";
  private readonly startedAt: number;

  constructor(
    private readonly logger: Logger,
    private readonly clock: Clock,
    private readonly name: string,
    attributes: SpanAttributes,
  ) {
    this.attributes = { ...attributes };
    this.startedAt = clock.now().getTime();
  }

  setAttribute(key: string, value: SpanAttributeValue): void {
    this.attributes[key] = value;
  }

  setStatus(status: SpanStatus): void {
    this.status = status;
  }

  recordException(error: Error): void {
    this.attributes["exception.message"] = error.message;
  }

  end(): void {
    this.logger.debug(this.name, {
      ...this.attributes,
      status: this.status,
      ms: this.clock.now().getTime() - this.startedAt,
    });
  }
}

/**
 * DECISION: agent-host traces to its logger rather than to OTel. Why: the
 * OpenTelemetry SDK is six more dependencies in a process whose whole job is to
 * be trivially runnable without credentials, and the span the demo actually
 * needs — `hook.pre_tool_use` — is far more legible as a `warn` line beside the
 * decision it describes. `Tracer` is a port; swapping an OTel adapter in later
 * is a wiring edit, which is exactly what the port is for.
 */
export class LogTracer implements Tracer {
  constructor(
    private readonly logger: Logger,
    private readonly clock: Clock,
  ) {}

  startSpan(name: string, attributes: SpanAttributes): Span {
    return new LogSpan(this.logger, this.clock, name, attributes);
  }
}
