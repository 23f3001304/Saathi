import type { Database as SqliteDatabase } from "better-sqlite3";

import type { LedgerTransaction, SqliteEventWriter } from "@covenant/ledger";

import type { SettlementPorts, VerdictCheck } from "../src/index.js";
import {
  CooloffCheck,
  EnvelopeCheck,
  EnvelopeReservationManager,
  IntentBoundsCheck,
  MandateStore,
  PriceFloorStore,
  MemoryDigestCheck,
  NonceCheck,
  QuoteMatchCheck,
  RiskDataCheck,
  SqliteNonceRegistry,
  StockReservationManager,
  TransactionStore,
  UriPinCheck,
} from "../src/index.js";

import type {
  CountingIds,
  FakeMemoryStore,
  FakePaymentRail,
  FixedClock,
  ManualTimers,
  NoopTracer,
  RecordingPublisher,
  SilentLogger,
} from "./fakes.js";
import type { Crypto } from "./mandate-harness.js";

export const API_VERSION = "2026-08-31";

/** Everything the service wiring needs; the harness assembles it once. */
export interface Parts extends Stores {
  readonly db: SqliteDatabase;
  readonly clock: FixedClock;
  readonly ids: CountingIds;
  readonly logger: SilentLogger;
  readonly tracer: NoopTracer;
  readonly published: RecordingPublisher;
  readonly ledger: LedgerTransaction;
  readonly events: SqliteEventWriter;
  readonly crypto: Crypto;
  readonly memory: FakeMemoryStore;
  readonly rail: FakePaymentRail;
  readonly timers: ManualTimers;
}

/** The eight checks in the §8.1 order the composition root will wire. */
export function orderedChecks(): readonly VerdictCheck[] {
  return [
    new IntentBoundsCheck(),
    new NonceCheck(),
    new UriPinCheck(),
    new RiskDataCheck(),
    new MemoryDigestCheck(),
    new QuoteMatchCheck(),
    new EnvelopeCheck(),
    new CooloffCheck(),
  ];
}

export interface Stores {
  readonly nonces: SqliteNonceRegistry;
  readonly transactions: TransactionStore;
  readonly envelopes: EnvelopeReservationManager;
  readonly stock: StockReservationManager;
  readonly floors: PriceFloorStore;
  readonly mandates: MandateStore;
  readonly ports: SettlementPorts;
}

export function newStores(db: SqliteDatabase): Stores {
  const nonces = new SqliteNonceRegistry(db);
  const transactions = new TransactionStore(db);
  const envelopes = new EnvelopeReservationManager(db);
  const stock = new StockReservationManager(db);
  const floors = new PriceFloorStore(db);
  const mandates = new MandateStore(db);
  return {
    nonces,
    transactions,
    envelopes,
    stock,
    floors,
    mandates,
    ports: { envelopes, mandates, transactions, stock },
  };
}
