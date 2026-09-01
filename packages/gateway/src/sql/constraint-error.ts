import type { ReasonCode } from "@covenant/domain";

interface SqliteError {
  readonly code?: unknown;
}

function codeOf(error: unknown): string {
  const candidate = (error as SqliteError | null)?.code;
  return typeof candidate === "string" ? candidate : "";
}

/**
 * A constraint violation is the *enforcement*, not an accident (§8.3): the
 * nonce `PRIMARY KEY (nonce, purpose)` and the stock
 * `PRIMARY KEY (reservation_id)` are what actually stop a replay and a
 * double-claim, so the commit phase catches them and translates them into the
 * verdict the presenter should have seen.
 */
export function isConstraintViolation(error: unknown): boolean {
  return codeOf(error).startsWith("SQLITE_CONSTRAINT");
}

export function constraintReason(
  error: unknown,
  reasonCode: ReasonCode,
): ReasonCode | null {
  return isConstraintViolation(error) ? reasonCode : null;
}

const TABLE_PATTERN = /constraint failed:\s*([A-Za-z_]+)\./;

/**
 * Which table refused the write. SQLite names it in the message and nowhere
 * else, so the parse is deliberate rather than incidental: `stock_reservations`
 * means a lost last-unit race and `nonces` means a replay, and answering one
 * with the other's reason code would poison merchant trust for a race nobody
 * lost on purpose (§5.2 d).
 */
export function constraintTableOf(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  return TABLE_PATTERN.exec(message)?.[1] ?? "";
}
