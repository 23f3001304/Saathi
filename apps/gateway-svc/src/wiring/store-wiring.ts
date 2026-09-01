import type { Database as SqliteDatabase } from "better-sqlite3";

import type { Clock, IdGenerator } from "@covenant/domain";
import type { SettlementPorts } from "@covenant/gateway";
import {
  EnvelopeReservationManager,
  MandateStore,
  PriceFloorStore,
  SqliteNonceRegistry,
  StockReservationManager,
  TransactionStore,
} from "@covenant/gateway";
import {
  DatabaseFactory,
  HashChain,
  LedgerTransaction,
  Migrations,
  SqliteEventReader,
  SqliteEventWriter,
} from "@covenant/ledger";
import {
  SqliteMemoryReader,
  SqliteMemoryWriter,
  VecIndex,
} from "@covenant/memory";

import type { GatewayConfig } from "../config.js";
import { LedgerStreamHub } from "../http/sse/ledger-stream-hub.js";
import { MemoryStoreFacade } from "../memory/memory-store-facade.js";
import type { ObsParts } from "./obs-wiring.js";

export interface StoreParts extends SettlementPorts {
  readonly db: SqliteDatabase;
  readonly readDb: SqliteDatabase;
  readonly ledger: LedgerTransaction;
  readonly events: SqliteEventWriter;
  readonly reader: SqliteEventReader;
  readonly hub: LedgerStreamHub;
  readonly nonces: SqliteNonceRegistry;
  readonly floors: PriceFloorStore;
  readonly ports: SettlementPorts;
  readonly vec: VecIndex;
  readonly memoryReader: SqliteMemoryReader;
  readonly memoryWriter: SqliteMemoryWriter;
  readonly memoryStore: MemoryStoreFacade;
  readonly readMemory: SqliteMemoryReader;
}

/**
 * DECISION: `COVENANT_DB=:memory:` reuses the writer handle for reads. Why: an
 * in-memory database is private to its connection, so a second `openReader`
 * would answer every audit query against an empty schema — a silent wrong
 * answer where the file case is right. The WAL snapshot argument of §5.1 only
 * applies to a file.
 */
function readHandleOf(
  config: GatewayConfig,
  factory: DatabaseFactory,
  writer: SqliteDatabase,
): SqliteDatabase {
  return config.dbFile === ":memory:" ? writer : factory.openReader();
}

/**
 * Database, migrations, the ledger envelope, the SSE hub the envelope
 * publishes into, the four settlement projections and the memory facade
 * (§2.8). Every `new` on the storage side lives here.
 */
export function wireStores(
  config: GatewayConfig,
  obs: ObsParts,
  clock: Clock,
  ids: IdGenerator,
): StoreParts {
  const factory = new DatabaseFactory(
    { file: config.dbFile, vecExtensionPath: config.vecExtensionPath },
    obs.logger,
  );
  const db = factory.openWriter();
  const migrations = new Migrations(db, clock, obs.logger);
  migrations.apply();
  if (config.vecExtensionPath !== null) {
    migrations.applyVectorIndex();
  }
  const readDb = readHandleOf(config, factory, db);
  return assemble(db, readDb, obs, clock, ids);
}

function assemble(
  db: SqliteDatabase,
  readDb: SqliteDatabase,
  obs: ObsParts,
  clock: Clock,
  ids: IdGenerator,
): StoreParts {
  const reader = new SqliteEventReader(readDb);
  const hub = new LedgerStreamHub(reader, obs.logger);
  const ledger = new LedgerTransaction(db, hub, obs.tracer);
  const vec = new VecIndex(db, null, obs.logger);
  const memoryReader = new SqliteMemoryReader(db, vec);
  const memoryWriter = new SqliteMemoryWriter(db, vec);
  const projections = settlementOf(db);
  return {
    ...projections,
    db,
    readDb,
    ledger,
    events: new SqliteEventWriter(db, new HashChain(), clock, ids, ledger),
    reader,
    hub,
    nonces: new SqliteNonceRegistry(db),
    floors: new PriceFloorStore(db),
    ports: projections,
    vec,
    memoryReader,
    memoryWriter,
    memoryStore: new MemoryStoreFacade(memoryReader, memoryWriter),
    readMemory: new SqliteMemoryReader(
      readDb,
      new VecIndex(readDb, null, obs.logger),
    ),
  };
}

function settlementOf(db: SqliteDatabase): SettlementPorts {
  return {
    envelopes: new EnvelopeReservationManager(db),
    mandates: new MandateStore(db),
    transactions: new TransactionStore(db),
    stock: new StockReservationManager(db),
  };
}
