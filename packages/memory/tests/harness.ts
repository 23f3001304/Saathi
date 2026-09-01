import type { Database as SqliteDatabase } from "better-sqlite3";

import { GATEWAY_AUDIENCE } from "@covenant/domain";
import {
  DatabaseFactory,
  FoldRebuilder,
  FoldRegistry,
  HashChain,
  LedgerTransaction,
  Migrations,
  SqliteEventReader,
  SqliteEventWriter,
  StateHasher,
} from "@covenant/ledger";

import {
  AuthorityClaimRule,
  BooleanFlipRule,
  ChannelTierResolver,
  MemoryDigest,
  MemoryDriftState,
  MemoryProjection,
  NumericRelaxationRule,
  ReadGate,
  ReconciliationJob,
  RetrievalScorer,
  RuleChain,
  ScopeWideningRule,
  SqliteMemoryReader,
  SqliteMemoryWriter,
  TierPermissionRule,
  UnitMismatchRule,
  VecIndex,
  WriteCommitter,
  WriteGate,
  type LlmContradictionJudge,
} from "../src/index.js";

import {
  CountingIds,
  FixedClock,
  NoopTracer,
  RecordingPublisher,
  SilentLogger,
  StubVerifier,
} from "./fakes.js";

export const TENANT = "acme";
export const USER = "user_kavya";

export interface Stack {
  readonly db: SqliteDatabase;
  readonly clock: FixedClock;
  readonly logger: SilentLogger;
  readonly gate: WriteGate;
  readonly readGate: ReadGate;
  readonly reader: SqliteMemoryReader;
  readonly writer: SqliteMemoryWriter;
  readonly events: SqliteEventReader;
  readonly sink: SqliteEventWriter;
  readonly txn: LedgerTransaction;
  readonly reconciliation: ReconciliationJob;
  readonly drift: MemoryDriftState;
  readonly published: RecordingPublisher;
}

interface Parts {
  readonly db: SqliteDatabase;
  readonly factory: DatabaseFactory;
  readonly clock: FixedClock;
  readonly logger: SilentLogger;
  readonly tracer: NoopTracer;
  readonly judge: LlmContradictionJudge | null;
}

/** A real in-memory SQLite database with the §3 DDL applied — no mocks. */
export function newStack(judge: LlmContradictionJudge | null = null): Stack {
  const clock = new FixedClock();
  const logger = new SilentLogger();
  const tracer = new NoopTracer();
  const factory = new DatabaseFactory(
    { file: ":memory:", vecExtensionPath: null },
    logger,
  );
  const db = factory.openWriter();
  new Migrations(db, clock, logger).apply();
  return assemble({ db, factory, clock, logger, tracer, judge });
}

function assemble(parts: Parts): Stack {
  const { db, clock, logger, tracer } = parts;
  const published = new RecordingPublisher();
  const txn = new LedgerTransaction(db, published, tracer);
  const ids = new CountingIds();
  const sink = new SqliteEventWriter(db, new HashChain(), clock, ids, txn);
  const vec = new VecIndex(db, null, logger);
  const reader = new SqliteMemoryReader(db, vec);
  const writer = new SqliteMemoryWriter(db, vec);
  return {
    db,
    clock,
    logger,
    published,
    reader,
    writer,
    events: new SqliteEventReader(db),
    sink,
    txn,
    gate: gateOf(parts, { reader, writer, vec, sink, txn, ids }),
    readGate: new ReadGate(
      reader,
      new RetrievalScorer(clock),
      new MemoryDigest(),
      sink,
      txn,
      clock,
      tracer,
    ),
    ...reconciliationOf(parts, sink, txn),
  };
}

interface Wiring {
  readonly reader: SqliteMemoryReader;
  readonly writer: SqliteMemoryWriter;
  readonly vec: VecIndex;
  readonly sink: SqliteEventWriter;
  readonly txn: LedgerTransaction;
  readonly ids: CountingIds;
}

function gateOf(parts: Parts, wiring: Wiring): WriteGate {
  const { clock, tracer, judge } = parts;
  const rules = [
    new NumericRelaxationRule(),
    new ScopeWideningRule(),
    new BooleanFlipRule(),
    new AuthorityClaimRule(),
    new UnitMismatchRule(),
  ];
  return new WriteGate(
    new ChannelTierResolver(new StubVerifier(), GATEWAY_AUDIENCE),
    new TierPermissionRule(),
    new RuleChain(rules, tracer),
    judge,
    wiring.reader,
    new WriteCommitter(wiring.reader, wiring.writer, wiring.sink, wiring.ids),
    wiring.vec,
    wiring.sink,
    wiring.txn,
    clock,
    tracer,
  );
}

function reconciliationOf(
  parts: Parts,
  sink: SqliteEventWriter,
  txn: LedgerTransaction,
): Pick<Stack, "reconciliation" | "drift"> {
  const { db, factory, clock, logger } = parts;
  const registry = new FoldRegistry().register(new MemoryProjection());
  const hasher = new StateHasher(db);
  const rebuilder = new FoldRebuilder(
    new SqliteEventReader(db),
    registry,
    hasher,
    { open: () => shadowOf(factory, clock, logger) },
    clock,
    logger,
  );
  const drift = new MemoryDriftState();
  return {
    drift,
    reconciliation: new ReconciliationJob(
      rebuilder,
      hasher,
      sink,
      txn,
      clock,
      logger,
      drift,
      TENANT,
    ),
  };
}

function shadowOf(
  factory: DatabaseFactory,
  clock: FixedClock,
  logger: SilentLogger,
): SqliteDatabase {
  const shadow = factory.openShadow();
  new Migrations(shadow, clock, logger).apply();
  return shadow;
}
