import { AsyncLocalStorage } from "node:async_hooks";

import type { Clock, IdGenerator, Logger, Tracer } from "@covenant/domain";
import { pino } from "pino";

import type { AgentHostConfig } from "../config.js";
import { DecisionJournal } from "../obs/decision-journal.js";
import { LogTracer } from "../obs/log-tracer.js";
import { PinoLogger, REDACTED_PATHS } from "../obs/pino-logger.js";
import type { ContextStore, RequestContext } from "../obs/request-store.js";
import { RouterJournal } from "../obs/router-journal.js";

export interface ObsParts {
  readonly logger: Logger;
  readonly tracer: Tracer;
  readonly store: ContextStore;
  readonly journal: DecisionJournal;
  /** Where the hidden model router writes down what it chose, and why. */
  readonly routing: RouterJournal;
}

/**
 * The observability adapters and the AsyncLocalStorage they read (§2.8).
 * `redact` is configured here and nowhere else: this process holds the user and
 * merchant private keys, so "a signature never reaches a sink" has to be a
 * property of the logger rather than a rule every call site remembers.
 */
export function wireObservability(
  config: AgentHostConfig,
  clock: Clock,
  ids: IdGenerator,
): ObsParts {
  const store: ContextStore = new AsyncLocalStorage<RequestContext>();
  const logger = new PinoLogger(
    pino({
      level: config.logLevel,
      base: { service: "agent-host" },
      redact: { paths: [...REDACTED_PATHS], censor: "[redacted]" },
    }),
    store,
  );
  return {
    logger,
    store,
    tracer: new LogTracer(logger, clock),
    journal: new DecisionJournal(clock, ids, logger),
    routing: new RouterJournal(clock, ids, logger),
  };
}
