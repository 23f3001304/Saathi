import type { Logger } from "@covenant/domain";
import { trace } from "@opentelemetry/api";
import type { Tracer as OtelApiTracer } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  NodeTracerProvider,
} from "@opentelemetry/sdk-trace-node";
import type { SpanProcessor } from "@opentelemetry/sdk-trace-node";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

import type { GatewayConfig } from "../config.js";
import { OtlpHttpSpanExporter } from "./otlp-exporter.js";

export const TRACER_NAME = "covenant.gateway";

export interface OtelRuntime {
  readonly tracer: OtelApiTracer;
  shutdown(): Promise<void>;
}

/**
 * NodeSDK-equivalent bootstrap (§2.8). `OTEL_EXPORTER_OTLP_ENDPOINT` unset
 * means **no exporter at all** rather than a localhost exporter that retries
 * into a closed port for the life of the process: the demo has to run without
 * the compose stack, and a tracing backend is not a dependency of correctness.
 */
export function startOtel(config: GatewayConfig, logger: Logger): OtelRuntime {
  const processors = processorsFor(config, logger);
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.serviceName,
      [ATTR_SERVICE_VERSION]: config.apiVersion,
    }),
    spanProcessors: [...processors],
  });
  provider.register();
  logger.info("otel.started", {
    endpoint: config.otlpEndpoint,
    exporters: processors.length,
  });
  return {
    tracer: trace.getTracer(TRACER_NAME),
    shutdown: () => provider.shutdown(),
  };
}

function processorsFor(
  config: GatewayConfig,
  logger: Logger,
): readonly SpanProcessor[] {
  if (config.otlpEndpoint === null) {
    return [];
  }
  return [
    new BatchSpanProcessor(
      new OtlpHttpSpanExporter(config.otlpEndpoint, logger),
    ),
  ];
}
