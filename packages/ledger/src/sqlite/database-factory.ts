import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Logger } from "@covenant/domain";

export interface DatabaseConfig {
  /** `data/covenant.db`, or `:memory:` for tests and the rebuild shadow. */
  readonly file: string;
  /**
   * Path passed to `loadExtension` for `sqlite-vec`. `null` skips the load; the
   * readiness probe, not this factory, decides whether absence is fatal.
   */
  readonly vecExtensionPath: string | null;
}

/** Section 3.1, in this order. The writer fsyncs every commit (section 5.1). */
const WRITER_PRAGMAS = [
  "journal_mode = WAL",
  "synchronous = FULL",
  "foreign_keys = ON",
  "busy_timeout = 5000",
  "trusted_schema = OFF",
  "wal_autocheckpoint = 1000",
  "cache_size = -16000",
] as const;

/** A reader never fsyncs, so `synchronous = NORMAL` is free (section 5.1). */
const READER_PRAGMAS = [
  "synchronous = NORMAL",
  "foreign_keys = ON",
  "busy_timeout = 5000",
  "trusted_schema = OFF",
  "cache_size = -16000",
] as const;

/**
 * One writer connection plus N read-only connections (decision 8). better-
 * sqlite3 is synchronous, so a single writer removes every SQLITE_BUSY path
 * from the money flow, and WAL gives readers a snapshot that never blocks it.
 *
 * DECISION: `SELECT load_extension('sqlite-vec')` of section 3.1 is driven by
 * a nullable config path, and `openShadow` is a third role. Why: sqlite-vec
 * is not a dependency of this package, and the rebuild shadow needs a
 * connection that is neither the writer nor a reader of the live file.
 */
export class DatabaseFactory {
  constructor(
    private readonly config: DatabaseConfig,
    private readonly logger: Logger,
  ) {}

  openWriter(): SqliteDatabase {
    // The writer is the only role that may bring the file into existence, so
    // it is also the only one that may create the directory holding it. A
    // fresh clone and `pnpm reset` both leave `data/` absent, and SQLite
    // reports that as "unable to open database file" — true, and useless.
    mkdirSync(dirname(this.config.file), { recursive: true });
    const db = new Database(this.config.file);
    this.applyPragmas(db, WRITER_PRAGMAS);
    this.loadVectorExtension(db);
    this.logger.info("ledger.db.opened", {
      file: this.config.file,
      role: "writer",
    });
    return db;
  }

  openReader(): SqliteDatabase {
    const db = new Database(this.config.file, { readonly: true });
    this.applyPragmas(db, READER_PRAGMAS);
    this.loadVectorExtension(db);
    return db;
  }

  /**
   * The rebuild shadow (section 3.10 rule 4): a private in-memory database, so
   * a replay can never reach the live schema or its protective triggers.
   */
  openShadow(): SqliteDatabase {
    const db = new Database(":memory:");
    this.applyPragmas(db, ["foreign_keys = ON", "trusted_schema = OFF"]);
    return db;
  }

  private applyPragmas(db: SqliteDatabase, pragmas: readonly string[]): void {
    for (const pragma of pragmas) {
      db.pragma(pragma);
    }
  }

  private loadVectorExtension(db: SqliteDatabase): void {
    const path = this.config.vecExtensionPath;
    if (path === null) {
      return;
    }
    db.loadExtension(path);
  }
}
