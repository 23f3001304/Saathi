import type { EventKind } from "@covenant/domain";

import type { FoldReducer } from "./fold-reducer.js";

/**
 * Holds reducers keyed by event kind. Registration happens in the composition
 * root, so adding a projection is one line there and zero engine edits.
 */
export class FoldRegistry {
  private readonly byKind = new Map<EventKind, FoldReducer[]>();
  private readonly ordered: FoldReducer[] = [];

  register(reducer: FoldReducer): this {
    if (this.ordered.some((known) => known.name === reducer.name)) {
      throw new RangeError(`Fold "${reducer.name}" is already registered`);
    }
    this.ordered.push(reducer);
    for (const kind of reducer.kinds) {
      const bucket = this.byKind.get(kind) ?? [];
      bucket.push(reducer);
      this.byKind.set(kind, bucket);
    }
    return this;
  }

  /** Registration order, which is the order a single event is applied in. */
  forKind(kind: EventKind): readonly FoldReducer[] {
    return this.byKind.get(kind) ?? [];
  }

  all(): readonly FoldReducer[] {
    return this.ordered;
  }

  /** Every projection table, de-duplicated, for the rebuild diff. */
  tables(): readonly string[] {
    const seen = new Set<string>();
    for (const reducer of this.ordered) {
      for (const table of reducer.tables) {
        seen.add(table);
      }
    }
    return [...seen].sort();
  }
}
