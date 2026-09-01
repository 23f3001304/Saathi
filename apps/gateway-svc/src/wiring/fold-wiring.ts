import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Clock, Logger } from "@covenant/domain";
import type { ShadowSchema } from "@covenant/ledger";
import {
  DatabaseFactory,
  FoldRebuilder,
  FoldRegistry,
  FoldRunner,
  HashChain,
  LedgerVerifier,
  Migrations,
  SqliteEventReader,
  StateHasher,
} from "@covenant/ledger";
import { MemoryProjection } from "@covenant/memory";
import {
  MerchantTrustFold,
  SkuPriceHistoryFold,
  UserPrefsFold,
} from "@covenant/recs";

import type { ObsParts } from "./obs-wiring.js";
import type { StoreParts } from "./store-wiring.js";

export interface FoldParts {
  readonly registry: FoldRegistry;
  readonly runner: FoldRunner;
  readonly rebuilder: FoldRebuilder;
  readonly hasher: StateHasher;
  readonly verifier: LedgerVerifier;
}

/**
 * The rebuild target of §3.10 rule 4: a private in-memory database carrying
 * the same DDL, so a replay can never reach the live schema or the three
 * `RAISE(ABORT)` triggers that protect it.
 */
class MigratedShadowSchema implements ShadowSchema {
  constructor(
    private readonly factory: DatabaseFactory,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  open(): SqliteDatabase {
    const db = this.factory.openShadow();
    new Migrations(db, this.clock, this.logger).apply();
    return db;
  }
}

/**
 * Every `FoldReducer` is registered here — new fold, one line, zero engine
 * edits (§2.8). The four are `packages/memory`'s projection plus the three
 * flywheel folds of §3.9, which read the ledger and can never write to it.
 */
export function wireFolds(
  stores: StoreParts,
  obs: ObsParts,
  clock: Clock,
): FoldParts {
  const registry = new FoldRegistry()
    .register(new MemoryProjection())
    .register(new MerchantTrustFold())
    .register(new SkuPriceHistoryFold())
    .register(new UserPrefsFold());
  const source = new SqliteEventReader(stores.db);
  const hasher = new StateHasher(stores.db);
  const factory = new DatabaseFactory(
    { file: ":memory:", vecExtensionPath: null },
    obs.logger,
  );
  return {
    registry,
    hasher,
    runner: new FoldRunner(source, registry, stores.db, clock, obs.tracer),
    rebuilder: new FoldRebuilder(
      source,
      registry,
      hasher,
      new MigratedShadowSchema(factory, clock, obs.logger),
      clock,
      obs.logger,
    ),
    verifier: new LedgerVerifier(stores.reader, new HashChain(), clock),
  };
}
