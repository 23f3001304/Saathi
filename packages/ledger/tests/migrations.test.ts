import { describe, expect, it } from "vitest";

import { DatabaseFactory, Migrations } from "../src/index.js";

import { FakeClock, SilentLogger } from "./fakes.js";
import { draft, newLedger } from "./harness.js";

const TABLES = [
  "envelope_reservations",
  "events",
  "fold_state",
  "mandates",
  "memory",
  "merchant_trust",
  "nonces",
  "schema_version",
  "sku_price_floors",
  "sku_price_history",
  "stock_reservations",
  "transactions",
  "user_prefs",
];

const TRIGGERS = [
  "events_chain_guard",
  "events_no_delete",
  "events_no_update",
  "memory_frozen_columns",
  "memory_no_delete",
];

const EVENT_INDEXES = [
  "idx_events_kind_ts",
  "idx_events_mandate",
  "idx_events_tenant_seq",
  "idx_events_txn_seq",
];

function namesOf(ledger: ReturnType<typeof newLedger>, type: string): string[] {
  const rows = ledger.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all(type) as { name: string }[];
  return rows.map((row) => row.name);
}

describe("the section 3 DDL ships whole", () => {
  it("creates every table", () => {
    expect(namesOf(newLedger(), "table")).toEqual(TABLES);
  });

  it("creates every trigger and the attack_lane view", () => {
    const ledger = newLedger();
    expect(namesOf(ledger, "trigger")).toEqual(TRIGGERS);
    expect(namesOf(ledger, "view")).toEqual(["attack_lane"]);
  });

  it("creates the events indexes of section 3.3", () => {
    const indexes = namesOf(newLedger(), "index");
    for (const name of EVENT_INDEXES) {
      expect(indexes).toContain(name);
    }
  });
});

describe("pragmas and idempotency", () => {
  it.each([
    ["foreign_keys", 1],
    ["busy_timeout", 5000],
    ["trusted_schema", 0],
    ["wal_autocheckpoint", 1000],
    ["cache_size", -16000],
  ])("applies %s = %i on the writer", (pragma, expected) => {
    const ledger = newLedger();
    expect(ledger.db.pragma(pragma, { simple: true })).toBe(expected);
  });

  it("records exactly one schema_version row however often it runs", () => {
    const logger = new SilentLogger();
    const db = new DatabaseFactory(
      { file: ":memory:", vecExtensionPath: null },
      logger,
    ).openWriter();
    const migrations = new Migrations(db, new FakeClock(), logger);
    expect(migrations.apply()).toBe(Migrations.VERSION);
    migrations.apply();
    migrations.apply();
    expect(db.prepare("SELECT * FROM schema_version").all()).toHaveLength(1);
  });
});

const MEMORY_ROW = `INSERT INTO memory
 (id, tenant_id, user_id, type, tier, content, content_hash, entry_hash,
  source_channel, t_valid, t_created, write_event_id)
 VALUES ('mem_1', 'acme', 'u1', 'constraint', 3, '{"cap":1}', @h, @h,
         'user_signed_mandate', '2026-08-31T12:00:00.000Z',
         '2026-08-31T12:00:00.000Z', @event)`;

describe("memory is invalidated, never deleted", () => {
  it("aborts a DELETE and a frozen-column UPDATE on memory", () => {
    const ledger = newLedger();
    const event = ledger.writer.append(draft("memory.write.committed", {}));
    ledger.db.prepare(MEMORY_ROW).run({ h: "a".repeat(64), event: event.id });
    expect(() => ledger.db.exec("DELETE FROM memory")).toThrow(
      /E_MEMORY_IMMUTABLE/,
    );
    expect(() => ledger.db.exec("UPDATE memory SET tier = 0")).toThrow(
      /E_MEMORY_IMMUTABLE/,
    );
    ledger.db.exec("UPDATE memory SET t_expired = '2026-09-01T00:00:00.000Z'");
  });
});
