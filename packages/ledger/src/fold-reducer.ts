import type { Database as SqliteDatabase } from "better-sqlite3";

import type { EventKind, StoredEvent } from "@covenant/domain";

/**
 * A projection is a pure reducer (section 3.10). Four rules, and CI checks
 * them: `apply` reads only `event` and rows it previously wrote — no
 * `Date.now()`, no `Math.random()`, no `crypto.randomUUID()`, derived ids are
 * a `sha256(event.id + reducer.name)` prefix; events arrive strictly by `seq`;
 * re-applying one is a no-op; and the whole table rebuilds from `seq = 1`.
 *
 * DECISION: the interface carries `name` and `tables` beyond section 2.1's
 * `kinds` + `apply`. Why: `fold_state` is keyed by `fold_name` and rule 5's
 * state hash is per table, so neither can be inferred from `kinds`.
 *
 * `db` is a parameter rather than a constructor collaborator precisely so the
 * same reducer instance can rebuild into the shadow database.
 */
export interface FoldReducer {
  /** The `fold_state.fold_name` key. Unique across the registry. */
  readonly name: string;
  readonly kinds: readonly EventKind[];
  /** Projection tables this reducer owns, for the section 3.10 state hash. */
  readonly tables: readonly string[];
  apply(db: SqliteDatabase, event: StoredEvent): void;
}
