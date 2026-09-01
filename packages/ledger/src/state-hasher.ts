import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Sha256Hex } from "@covenant/domain";
import { canonicalize, sha256Hex } from "@covenant/domain";

export interface TableState {
  readonly table: string;
  readonly rows: number;
  readonly hash: Sha256Hex;
}

interface ColumnInfo {
  readonly name: string;
  readonly pk: number;
}

/** Table names are interpolated, so they are checked, never trusted. */
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

type CellValue = string | number | null;

/**
 * `sha256(canonicalize(rows ordered by primary key))`, columns in DDL order,
 * `NULL` emitted as JSON `null` (section 3.10 rule 5). It is the same function
 * for the live schema and the rebuild shadow, which is what makes the replay
 * proof a byte comparison rather than a row-by-row argument.
 *
 * DECISION: the live `Database` is the constructor collaborator of section
 * 2.1 and `hashIn` takes the database as a parameter. Why: one hash function
 * must serve both the live schema and the shadow, or the diff proves nothing.
 */
export class StateHasher {
  constructor(private readonly live: SqliteDatabase) {}

  hash(table: string): TableState {
    return this.hashIn(this.live, table);
  }

  hashIn(db: SqliteDatabase, table: string): TableState {
    if (!IDENTIFIER.test(table)) {
      throw new RangeError(`Not a table identifier: "${table}"`);
    }
    const columns = this.columnsOf(db, table);
    const rows = db
      .prepare(this.selectFor(table, columns))
      .raw()
      .all() as CellValue[][];
    return { table, rows: rows.length, hash: sha256Hex(canonicalize(rows)) };
  }

  private columnsOf(db: SqliteDatabase, table: string): readonly ColumnInfo[] {
    const info = db.pragma(`table_info(${table})`) as ColumnInfo[];
    if (info.length === 0) {
      throw new RangeError(`No such projection table: "${table}"`);
    }
    return info;
  }

  /**
   * Ordering by the declared primary key makes the dump total; a table without
   * one falls back to every column, which is still deterministic.
   */
  private selectFor(table: string, columns: readonly ColumnInfo[]): string {
    const keys = columns
      .filter((column) => column.pk > 0)
      .sort((left, right) => left.pk - right.pk)
      .map((column) => column.name);
    const names = columns.map((column) => column.name);
    const order = keys.length > 0 ? keys : names;
    return `SELECT ${names.join(", ")} FROM ${table} ORDER BY ${order.join(", ")}`;
  }
}
