import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Clock, Logger } from "@covenant/domain";

/** One conversation's working context, durably: the latest record and only
 *  the latest, keyed by the conversation it belongs to. */
export interface ContextLog {
  load: (conversationId: string) => string | null;
  save: (conversationId: string, json: string) => void;
  close: () => void;
}

/** The same retention the beat log keeps: a record is working state for a
 *  conversation somebody may come back to, not an archive. */
export const CONTEXT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * DECISION: a plain table in the ledger's own file, exactly as
 * `conversation_beats` is and for the same reasons — one durable artifact to
 * reset, back up and mount, rows that justify no payment and must stay
 * deletable, `node:sqlite` because it shares nothing with the ledger's tables.
 * One row per conversation rather than an append log, because the record *is*
 * the latest state: history of it would be a second transcript, and the beat
 * log already keeps the real one.
 *
 * DECISION: keyed by `conversation_id` and read only by it, the same scoping
 * the memory retrieval enforces in SQL (`json_extract` on the id) — chat A's
 * record is unreachable from chat B by construction, not by a filter applied
 * after a shared read.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS conversation_context (
  conversation_id TEXT PRIMARY KEY,
  at_ms           INTEGER NOT NULL,
  context_json    TEXT    NOT NULL CHECK (json_valid(context_json))
) STRICT;
`;

const UPSERT = `INSERT INTO conversation_context (conversation_id, at_ms, context_json)
  VALUES (?, ?, ?)
  ON CONFLICT(conversation_id) DO UPDATE SET
    at_ms = excluded.at_ms, context_json = excluded.context_json`;

const READ =
  "SELECT context_json FROM conversation_context WHERE conversation_id = ?";

/** Same pragmas as the beat log: the gateway holds the writer for this file,
 *  and `busy_timeout` keeps a one-row upsert from surfacing as SQLITE_BUSY. */
const PRAGMAS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = NORMAL",
  "PRAGMA busy_timeout = 5000",
  "PRAGMA trusted_schema = OFF",
].join(";");

class SqliteContextLog implements ContextLog {
  constructor(
    private readonly db: DatabaseSync,
    private readonly clock: Clock,
  ) {
    db.exec(PRAGMAS);
    db.exec(DDL);
    this.sweep();
  }

  load(conversationId: string): string | null {
    const row = this.db.prepare(READ).get(conversationId) as
      | { context_json: string }
      | undefined;
    return row?.context_json ?? null;
  }

  save(conversationId: string, json: string): void {
    this.db
      .prepare(UPSERT)
      .run(conversationId, this.clock.now().getTime(), json);
  }

  close(): void {
    this.db.close();
  }

  private sweep(): void {
    this.db
      .prepare("DELETE FROM conversation_context WHERE at_ms < ?")
      .run(this.clock.now().getTime() - CONTEXT_MAX_AGE_MS);
  }
}

/** A host that cannot reach the database still runs; it just forgets — the
 *  in-memory tables (`WebOffered`, the park) carry the session it is in. */
export function forgetfulContextLog(): ContextLog {
  return {
    load: () => null,
    save: () => undefined,
    close: () => undefined,
  };
}

export function openContextLog(
  file: string,
  clock: Clock,
  logger: Logger,
): ContextLog {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const log = new SqliteContextLog(new DatabaseSync(file), clock);
    logger.info("chat.context.opened", { file });
    return log;
  } catch (cause) {
    logger.warn("chat.context.unavailable", {
      file,
      cause: cause instanceof Error ? cause.message : "unknown",
    });
    return forgetfulContextLog();
  }
}
