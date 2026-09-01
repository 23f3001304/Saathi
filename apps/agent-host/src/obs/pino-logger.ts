import type { LogFields, Logger } from "@covenant/domain";
import type { Logger as Pino } from "pino";

import type { ContextStore } from "./request-store.js";
import { contextFields } from "./request-store.js";

/**
 * Never let a private key, a mandate JWT or a merchant quote JWS reach a sink.
 * The agent holds the user *and* merchant private keys in this process, so the
 * redaction list is if anything more load-bearing here than at the gateway.
 */
export const REDACTED_PATHS: readonly string[] = [
  "authorization",
  "signature",
  "sig",
  "envelope",
  "jws",
  "jwt",
  "payment_token",
  "vc_jwt",
  "*.authorization",
  "*.signature",
  "*.sig",
  "*.envelope",
  "*.jws",
  "*.jwt",
  "*.payment_token",
  "*.vc_jwt",
];

type Level = "debug" | "info" | "warn" | "error" | "fatal";

/**
 * The `Logger` port over pino. One JSON object per line, `evt` naming the
 * catalog entry of §10.4, and `request_id` / `run_id` lifted from
 * AsyncLocalStorage so no call site has to thread them.
 *
 * A blocked tool call logs at `warn`, never `error`: `error` means the system
 * is not doing its job, and a blocked F2 probe is the system doing its job.
 */
export class PinoLogger implements Logger {
  constructor(
    private readonly pino: Pino,
    private readonly store: ContextStore,
  ) {}

  debug(evt: string, fields: LogFields): void {
    this.write("debug", evt, fields);
  }

  info(evt: string, fields: LogFields): void {
    this.write("info", evt, fields);
  }

  warn(evt: string, fields: LogFields): void {
    this.write("warn", evt, fields);
  }

  error(evt: string, fields: LogFields): void {
    this.write("error", evt, fields);
  }

  fatal(evt: string, fields: LogFields): void {
    this.write("fatal", evt, fields);
  }

  private write(level: Level, evt: string, fields: LogFields): void {
    this.pino[level]({ ...contextFields(this.store), ...fields, evt });
  }
}
