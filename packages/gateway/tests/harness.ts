import type { Database as SqliteDatabase } from "better-sqlite3";

import {
  DatabaseFactory,
  HashChain,
  LedgerTransaction,
  Migrations,
  SqliteEventReader,
  SqliteEventWriter,
} from "@covenant/ledger";

import {
  CooloffScheduler,
  CooloffTransitions,
  ExecutePaymentService,
  IdempotencyResolver,
  PaymentOutcomeService,
  VerifyCartService,
} from "../src/index.js";
import {
  CountingIds,
  FakeMemoryStore,
  FakePaymentRail,
  FixedClock,
  ManualTimers,
  NoopTracer,
  RecordingPublisher,
  SilentLogger,
} from "./fakes.js";
import { GOLDEN_ENTRIES, NOW } from "./fixtures.js";
import type { Crypto } from "./mandate-harness.js";
import { buildCrypto } from "./mandate-harness.js";
import { executeServiceOf, pipelineOf, verifyServiceOf } from "./service-wiring.js";
import type { Parts, Stores } from "./stores.js";
import { newStores } from "./stores.js";

export { API_VERSION } from "./stores.js";

export interface Harness extends Stores {
  readonly db: SqliteDatabase;
  readonly clock: FixedClock;
  readonly ids: CountingIds;
  readonly crypto: Crypto;
  readonly memory: FakeMemoryStore;
  readonly rail: FakePaymentRail;
  readonly timers: ManualTimers;
  readonly published: RecordingPublisher;
  readonly events: SqliteEventWriter;
  readonly reader: SqliteEventReader;
  readonly ledger: LedgerTransaction;
  readonly verifyCart: VerifyCartService;
  readonly executePayment: ExecutePaymentService;
  readonly cooloff: CooloffScheduler;
  readonly outcomes: PaymentOutcomeService;
}

/** Real SQLite via the ledger's own factory; fakes only where the design says. */
export async function newHarness(): Promise<Harness> {
  const clock = new FixedClock(NOW);
  const logger = new SilentLogger();
  const tracer = new NoopTracer();
  const ids = new CountingIds();
  const db = new DatabaseFactory(
    { file: ":memory:", vecExtensionPath: null },
    logger,
  ).openWriter();
  new Migrations(db, clock, logger).apply();
  const published = new RecordingPublisher();
  const ledger = new LedgerTransaction(db, published, tracer);
  const memory = new FakeMemoryStore();
  for (const entry of GOLDEN_ENTRIES) {
    memory.put(entry);
  }
  return assemble({
    ...newStores(db),
    db,
    clock,
    ids,
    logger,
    tracer,
    published,
    ledger,
    events: new SqliteEventWriter(db, new HashChain(), clock, ids, ledger),
    crypto: await buildCrypto(clock),
    memory,
    rail: new FakePaymentRail(),
    timers: new ManualTimers(),
  });
}

function assemble(parts: Parts): Harness {
  const idempotency = new IdempotencyResolver(parts.nonces);
  const executePayment = executeServiceOf(parts, idempotency);
  return {
    ...parts,
    reader: new SqliteEventReader(parts.db),
    verifyCart: verifyServiceOf(parts, pipelineOf(parts), idempotency),
    executePayment,
    cooloff: new CooloffScheduler(
      parts.transactions,
      parts.mandates,
      new CooloffTransitions(
        parts.ledger,
        parts.events,
        parts.transactions,
        parts.envelopes,
        parts.clock,
      ),
      executePayment,
      parts.timers,
      parts.clock,
      parts.ids,
      parts.logger,
    ),
    outcomes: new PaymentOutcomeService(
      parts.ledger,
      parts.events,
      new SqliteEventReader(parts.db),
      parts.transactions,
      parts.envelopes,
    ),
  };
}
