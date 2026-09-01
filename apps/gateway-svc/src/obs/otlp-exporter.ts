import type { Logger } from "@covenant/domain";
import type { ExportResult } from "@opentelemetry/core";
import { ExportResultCode } from "@opentelemetry/core";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-node";

import { encodeTraces } from "./otlp-encode.js";

const TRACES_PATH = "/v1/traces";

const EXPORT_TIMEOUT_MS = 5_000;

/**
 * OTLP/HTTP JSON to the compose stack's Jaeger (`:4318`). A collector that is
 * down must never take the gateway with it, so an export failure is logged and
 * reported as `FAILED` — the batch processor drops it and the money path never
 * learns that tracing had a bad day.
 */
export class OtlpHttpSpanExporter implements SpanExporter {
  private readonly url: string;

  constructor(
    endpoint: string,
    private readonly logger: Logger,
  ) {
    this.url = `${endpoint.replace(/\/+$/, "")}${TRACES_PATH}`;
  }

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    void this.post(spans).then(resultCallback);
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  private async post(spans: readonly ReadableSpan[]): Promise<ExportResult> {
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(encodeTraces(spans)),
        signal: AbortSignal.timeout(EXPORT_TIMEOUT_MS),
      });
      return response.ok
        ? { code: ExportResultCode.SUCCESS }
        : this.failed(new Error(`otlp status ${response.status}`));
    } catch (cause) {
      return this.failed(cause instanceof Error ? cause : new Error("otlp"));
    }
  }

  private failed(error: Error): ExportResult {
    this.logger.warn("otel.export.failed", {
      endpoint: this.url,
      cause: error.message,
    });
    return { code: ExportResultCode.FAILED, error };
  }
}
