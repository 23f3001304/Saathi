import type { Database as SqliteDatabase } from "better-sqlite3";

import type { EventDraft, EventKind, EventPayload } from "@covenant/domain";

import {
  DatabaseFactory,
  FoldRebuilder,
  FoldRegistry,
  FoldRunner,
  HashChain,
  LedgerTransaction,
  LedgerVerifier,
  Migrations,
  SqliteEventReader,
  SqliteEventWriter,
  StateHasher,
} from "../src/index.js";

import {
  CountingIds,
  FakeClock,
  NoopTracer,
  RecordingPublisher,
  SilentLogger,
} from "./fakes.js";
import { MerchantTrustTestFold, SkuPriceTestFold } from "./test-folds.js";

export const TENANT = "acme";

export interface Ledger {
  readonly db: SqliteDatabase;
  readonly writer: SqliteEventWriter;
  readonly reader: SqliteEventReader;
  readonly txn: LedgerTransaction;
  readonly chain: HashChain;
  readonly verifier: LedgerVerifier;
  readonly registry: FoldRegistry;
  readonly runner: FoldRunner;
  readonly rebuilder: FoldRebuilder;
  readonly hasher: StateHasher;
  readonly published: RecordingPublisher;
}

/** A real in-memory SQLite database with the section 3 DDL applied. */
export function newLedger(): Ledger {
  const clock = new FakeClock();
  const logger = new SilentLogger();
  const tracer = new NoopTracer();
  const factory = new DatabaseFactory(
    { file: ":memory:", vecExtensionPath: null },
    logger,
  );
  const db = factory.openWriter();
  new Migrations(db, clock, logger).apply();
  return assemble({ db, factory, clock, logger, tracer });
}

interface Parts {
  readonly db: SqliteDatabase;
  readonly factory: DatabaseFactory;
  readonly clock: FakeClock;
  readonly logger: SilentLogger;
  readonly tracer: NoopTracer;
}

function assemble({ db, factory, clock, logger, tracer }: Parts): Ledger {
  const chain = new HashChain();
  const published = new RecordingPublisher();
  const txn = new LedgerTransaction(db, published, tracer);
  const reader = new SqliteEventReader(db);
  const hasher = new StateHasher(db);
  const registry = new FoldRegistry()
    .register(new MerchantTrustTestFold())
    .register(new SkuPriceTestFold());

  return {
    db,
    writer: new SqliteEventWriter(db, chain, clock, new CountingIds(), txn),
    reader,
    txn,
    chain,
    verifier: new LedgerVerifier(reader, chain, clock),
    registry,
    runner: new FoldRunner(reader, registry, db, clock, tracer),
    rebuilder: new FoldRebuilder(
      reader,
      registry,
      hasher,
      { open: () => shadowOf(factory, clock, logger) },
      clock,
      logger,
    ),
    hasher,
    published,
  };
}

function shadowOf(
  factory: DatabaseFactory,
  clock: FakeClock,
  logger: SilentLogger,
): SqliteDatabase {
  const shadow = factory.openShadow();
  new Migrations(shadow, clock, logger).apply();
  return shadow;
}

export function draft(
  kind: EventKind,
  payload: EventPayload = {},
  txnId: string | null = null,
): EventDraft {
  return {
    tenant_id: TENANT,
    actor: "gateway",
    kind,
    txn_id: txnId,
    request_id: null,
    mandate_id: null,
    payload,
  };
}

export function quote(merchant: string, sku: string, total: number): EventDraft {
  return draft("catalog.quote.received", {
    merchant_id: merchant,
    sku_id: sku,
    total_paise: total,
    quote_jti: `urn:uuid:${sku}`,
  });
}
