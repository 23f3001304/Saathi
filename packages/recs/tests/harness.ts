import type { Database as SqliteDatabase } from "better-sqlite3";

import type {
  EventDraft,
  EventKind,
  EventPayload,
  IsoTimestamp,
  MemoryEntry,
  MemorySearchQuery,
  MemoryStore,
  StoredEvent,
} from "@covenant/domain";
import {
  DatabaseFactory,
  FoldRebuilder,
  FoldRegistry,
  FoldRunner,
  HashChain,
  LedgerTransaction,
  Migrations,
  SqliteEventReader,
  SqliteEventWriter,
  StateHasher,
} from "@covenant/ledger";
import { SqliteMemoryReader, SqliteMemoryWriter, VecIndex } from "@covenant/memory";

import { MerchantTrustFold, SkuPriceHistoryFold, UserPrefsFold } from "../src/index.js";

import { CountingIds, FixedClock, NoopTracer, RecordingPublisher, SilentLogger } from "./fakes.js";

export const TENANT = "acme";
export const USER = "user_kavya";

export interface Stack {
  readonly db: SqliteDatabase;
  readonly clock: FixedClock;
  readonly ids: CountingIds;
  readonly writer: SqliteEventWriter;
  readonly reader: SqliteEventReader;
  readonly txn: LedgerTransaction;
  readonly registry: FoldRegistry;
  readonly runner: FoldRunner;
  readonly rebuilder: FoldRebuilder;
  readonly hasher: StateHasher;
  readonly memoryReader: SqliteMemoryReader;
  readonly memoryWriter: SqliteMemoryWriter;
  /** The read+write facade `apps/gateway-svc` assembles in production
   * (backend-architecture.md section 2.2) — recs receives exactly this port. */
  readonly memoryStore: MemoryStore;
}

/** A real in-memory SQLite database with the full DDL applied — no mocks. */
export function newStack(): Stack {
  const clock = new FixedClock();
  const logger = new SilentLogger();
  const tracer = new NoopTracer();
  const factory = new DatabaseFactory({ file: ":memory:", vecExtensionPath: null }, logger);
  const db = factory.openWriter();
  new Migrations(db, clock, logger).apply();
  return assemble(db, factory, clock, logger, tracer);
}

function assemble(
  db: SqliteDatabase,
  factory: DatabaseFactory,
  clock: FixedClock,
  logger: SilentLogger,
  tracer: NoopTracer,
): Stack {
  const ids = new CountingIds();
  const txn = new LedgerTransaction(db, new RecordingPublisher(), tracer);
  const sink = new SqliteEventWriter(db, new HashChain(), clock, ids, txn);
  const reader = new SqliteEventReader(db);
  const memory = memoryOf(db, logger);
  return {
    db,
    clock,
    ids,
    writer: sink,
    reader,
    txn,
    ...foldsOf(reader, db, clock, tracer, factory, logger),
    ...memory,
  };
}

interface MemoryParts {
  readonly memoryReader: SqliteMemoryReader;
  readonly memoryWriter: SqliteMemoryWriter;
  readonly memoryStore: MemoryStore;
}

function memoryOf(db: SqliteDatabase, logger: SilentLogger): MemoryParts {
  const vec = new VecIndex(db, null, logger);
  const memoryReader = new SqliteMemoryReader(db, vec);
  const memoryWriter = new SqliteMemoryWriter(db, vec);
  return { memoryReader, memoryWriter, memoryStore: memoryStoreOf(memoryReader, memoryWriter) };
}

/** A minimal `MemoryStore` facade over the reader/writer split (section 2.2:
 * "the composition root assembles a thin `MemoryStoreFacade`"). */
function memoryStoreOf(reader: SqliteMemoryReader, writer: SqliteMemoryWriter): MemoryStore {
  return {
    put: (entry: MemoryEntry) => writer.put(entry),
    getByIds: (tenantId: string, ids: readonly string[]) => reader.getByIds(tenantId, ids),
    liveConstraints: (tenantId: string, userId: string) => reader.liveConstraints(tenantId, userId),
    invalidate: (id: string, tExpired: IsoTimestamp, supersededBy: string | null) =>
      writer.invalidate(id, tExpired, supersededBy),
    search: (query: MemorySearchQuery) => reader.search(query),
  };
}

interface Folds {
  readonly registry: FoldRegistry;
  readonly runner: FoldRunner;
  readonly rebuilder: FoldRebuilder;
  readonly hasher: StateHasher;
}

function foldsOf(
  reader: SqliteEventReader,
  db: SqliteDatabase,
  clock: FixedClock,
  tracer: NoopTracer,
  factory: DatabaseFactory,
  logger: SilentLogger,
): Folds {
  const registry = new FoldRegistry()
    .register(new SkuPriceHistoryFold())
    .register(new MerchantTrustFold())
    .register(new UserPrefsFold());
  const hasher = new StateHasher(db);
  return {
    registry,
    hasher,
    runner: new FoldRunner(reader, registry, db, clock, tracer),
    rebuilder: new FoldRebuilder(
      reader,
      registry,
      hasher,
      { open: () => shadowOf(factory, clock, logger) },
      clock,
      logger,
    ),
  };
}

function shadowOf(factory: DatabaseFactory, clock: FixedClock, logger: SilentLogger): SqliteDatabase {
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

/** Appends one event inside its own transaction, as the money path always does. */
export function append(
  stack: Stack,
  kind: EventKind,
  payload: EventPayload = {},
  txnId: string | null = null,
): StoredEvent {
  return stack.txn.run("test", () => stack.writer.append(draft(kind, payload, txnId)));
}
