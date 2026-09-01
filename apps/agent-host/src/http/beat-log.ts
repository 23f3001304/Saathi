import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Clock, Logger } from "@covenant/domain";

/** One stored beat, addressed the way the hub addresses a live one. */
export interface StoredBeat {
  readonly epoch: number;
  readonly index: number;
  readonly kind: string;
  readonly json: string;
}

export interface BeatLog {
  /** The highest epoch this file has ever held, so a restart never reuses one. */
  readonly lastEpoch: number;
  append: (conversationId: string, beat: StoredBeat) => void;
  read: (conversationId: string) => readonly StoredBeat[];
  close: () => void;
}

/** The newest N beats of a conversation; the rest go on the next append. */
export const BEATS_PER_CONVERSATION = 500;

/** No conversation's beats outlive this, swept once at boot. */
export const BEAT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * DECISION: a plain table in the ledger's own file, not a row in `events`. Why:
 * `events` is hash-chained and money-facing — every row there is replayed to
 * justify a payment, and its triggers refuse UPDATE and DELETE outright. A
 * conversation log has to be *bounded*, which means its rows must be deletable,
 * and a beat justifies nothing. Same file because there is one durable artifact
 * to reset, back up and mount, and a second one would be a second thing to
 * forget.
 *
 * DECISION: `node:sqlite`, not the ledger's `better-sqlite3`. Why: this table
 * is agent-host's own and shares no row, trigger or foreign key with the
 * ledger's, so linking the ledger's driver would buy nothing but a dependency —
 * and the single-writer discipline that driver exists to enforce belongs to the
 * gateway's tables, not to this one.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS conversation_beats (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT    NOT NULL,
  epoch           INTEGER NOT NULL,
  idx             INTEGER NOT NULL,
  at_ms           INTEGER NOT NULL,
  kind            TEXT    NOT NULL,
  beat_json       TEXT    NOT NULL CHECK (json_valid(beat_json))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_conv_beats_chat ON conversation_beats(conversation_id, seq);
CREATE INDEX IF NOT EXISTS idx_conv_beats_age  ON conversation_beats(at_ms);
`;

const INSERT = `INSERT INTO conversation_beats
  (conversation_id, epoch, idx, at_ms, kind, beat_json) VALUES (?, ?, ?, ?, ?, ?)`;

/** Everything below the newest `keep` rows of this conversation. */
const TRIM = `DELETE FROM conversation_beats
  WHERE conversation_id = ? AND seq <= COALESCE((
    SELECT seq FROM conversation_beats WHERE conversation_id = ?
     ORDER BY seq DESC LIMIT 1 OFFSET ?), -1)`;

const READ = `SELECT epoch, idx, kind, beat_json FROM conversation_beats
  WHERE conversation_id = ? ORDER BY seq`;

const HEAD = "SELECT COALESCE(MAX(epoch), 0) AS epoch FROM conversation_beats";

interface BeatRow {
  readonly epoch: number;
  readonly idx: number;
  readonly kind: string;
  readonly beat_json: string;
}

/**
 * The gateway holds the writer for this file. `busy_timeout` is what keeps a
 * beat insert — one row, no open transaction — from ever surfacing as
 * SQLITE_BUSY on either side.
 */
const PRAGMAS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA synchronous = NORMAL",
  "PRAGMA busy_timeout = 5000",
  "PRAGMA trusted_schema = OFF",
].join(";");

class SqliteBeatLog implements BeatLog {
  readonly lastEpoch: number;

  constructor(
    private readonly db: DatabaseSync,
    private readonly clock: Clock,
  ) {
    db.exec(PRAGMAS);
    db.exec(DDL);
    this.sweep();
    const head = db.prepare(HEAD).get() as unknown as { epoch: number };
    this.lastEpoch = head.epoch;
  }

  append(conversationId: string, beat: StoredBeat): void {
    this.db
      .prepare(INSERT)
      .run(
        conversationId,
        beat.epoch,
        beat.index,
        this.clock.now().getTime(),
        beat.kind,
        beat.json,
      );
    this.db
      .prepare(TRIM)
      .run(conversationId, conversationId, BEATS_PER_CONVERSATION);
  }

  read(conversationId: string): readonly StoredBeat[] {
    const rows = this.db.prepare(READ).all(conversationId) as unknown[];
    return rows.map((raw) => {
      const row = raw as BeatRow;
      return {
        epoch: row.epoch,
        index: row.idx,
        kind: row.kind,
        json: row.beat_json,
      };
    });
  }

  close(): void {
    this.db.close();
  }

  private sweep(): void {
    this.db
      .prepare("DELETE FROM conversation_beats WHERE at_ms < ?")
      .run(this.clock.now().getTime() - BEAT_MAX_AGE_MS);
  }
}

/** A host that cannot reach the database still runs; it just forgets. */
export function forgetfulBeatLog(): BeatLog {
  return {
    lastEpoch: 0,
    append: () => undefined,
    read: () => [],
    close: () => undefined,
  };
}

export function openBeatLog(
  file: string,
  clock: Clock,
  logger: Logger,
): BeatLog {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const log = new SqliteBeatLog(new DatabaseSync(file), clock);
    logger.info("chat.beats.opened", { file, last_epoch: log.lastEpoch });
    return log;
  } catch (cause) {
    logger.warn("chat.beats.unavailable", {
      file,
      cause: cause instanceof Error ? cause.message : "unknown",
    });
    return forgetfulBeatLog();
  }
}
