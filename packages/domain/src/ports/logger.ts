export type LogFields = Readonly<Record<string, unknown>>;

/**
 * Structured log port — keeps pino out of `packages/` (decision 3). A blocked
 * attack logs at `warn`, never `error`: `error` means the system is not doing
 * its job, and a blocked T-1 is the system doing its job (decision 46).
 */
export interface Logger {
  debug(evt: string, fields: LogFields): void;
  info(evt: string, fields: LogFields): void;
  warn(evt: string, fields: LogFields): void;
  error(evt: string, fields: LogFields): void;
  fatal(evt: string, fields: LogFields): void;
}
