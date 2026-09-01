import { existsSync, readFileSync } from "node:fs";

import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Clock, Logger } from "@covenant/domain";

// DECISION: the `vec0` table is a separate method, not part of `schema.sql`.
// Why: it needs the sqlite-vec extension loaded, and a database opened
// without it must still carry the whole of section 3.

/** Section 3.5: keyed by `memory_id`, so `memory` stays STRICT and protected. */
const VECTOR_INDEX_DDL = `CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
  memory_id TEXT PRIMARY KEY,
  embedding FLOAT[384]
);`;

/**
 * `schema.sql` ships beside this module as a build asset. `tsc -b` emits only
 * JavaScript, so a compiled copy resolves the asset back out of `src/`.
 */
const SCHEMA_CANDIDATES = [
  "./schema.sql",
  "../../../src/sqlite/schema.sql",
] as const;

/**
 * Applies the section 3 DDL idempotently and records `schema_version`. Every
 * statement is `IF NOT EXISTS`, so a boot against an existing file is a no-op.
 */
export class Migrations {
  static readonly VERSION = 1;

  constructor(
    private readonly db: SqliteDatabase,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  apply(): number {
    const ddl = this.readSchema();
    this.db.transaction(() => {
      this.db.exec(ddl);
      this.recordVersion();
    })();
    this.logger.info("ledger.schema.applied", { version: Migrations.VERSION });
    return Migrations.VERSION;
  }

  /**
   * Separate because `vec0` needs the `sqlite-vec` extension loaded, and a
   * database opened without it must still carry the whole of section 3.
   */
  applyVectorIndex(): void {
    this.db.exec(VECTOR_INDEX_DDL);
  }

  private recordVersion(): void {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)",
      )
      .run(Migrations.VERSION, this.clock.now().toISOString());
  }

  private readSchema(): string {
    for (const candidate of SCHEMA_CANDIDATES) {
      const url = new URL(candidate, import.meta.url);
      if (existsSync(url)) {
        return readFileSync(url, "utf8");
      }
    }
    throw new Error(
      `ledger schema.sql not found near ${import.meta.url}; tried ${SCHEMA_CANDIDATES.join(", ")}`,
    );
  }
}
