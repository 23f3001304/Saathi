import { AsyncLocalStorage } from "node:async_hooks";

import type { Logger, Tracer } from "@covenant/domain";
import { pino } from "pino";

import type { GatewayConfig } from "../config.js";
import type { OtelRuntime } from "../obs/otel-bootstrap.js";
import { startOtel } from "../obs/otel-bootstrap.js";
import { OtelTracer } from "../obs/otel-tracer.js";
import { PinoLogger, REDACTED_PATHS } from "../obs/pino-logger.js";
import type { ContextStore, RequestContext } from "../obs/request-store.js";

export interface ObsParts {
  readonly logger: Logger;
  readonly tracer: Tracer;
  readonly store: ContextStore;
  readonly otel: OtelRuntime;
}

/**
 * The two observability adapters, and the AsyncLocalStorage they both read
 * (§2.8). `redact` is configured here and nowhere else: a private key or a raw
 * mandate JWT can never reach a log sink, and that has to be a property of the
 * logger rather than a rule every call site remembers (§10.4).
 */
export function wireObservability(config: GatewayConfig): ObsParts {
  const store: ContextStore = new AsyncLocalStorage<RequestContext>();
  const logger = new PinoLogger(
    pino({
      level: config.logLevel,
      base: { service: config.serviceName },
      redact: { paths: [...REDACTED_PATHS], censor: "[redacted]" },
    }),
    store,
  );
  const otel = startOtel(config, logger);
  return { logger, tracer: new OtelTracer(otel.tracer, store), store, otel };
}
