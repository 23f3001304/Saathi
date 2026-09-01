import { describe, expect, it } from "vitest";

import { GENESIS_HASH } from "@covenant/domain";

import { draft, newLedger } from "./harness.js";

const MUTATIONS: readonly (readonly [string, string])[] = [
  ["actor", "UPDATE events SET actor = 'user' WHERE seq = 1"],
  ["kind", "UPDATE events SET kind = 'payment.captured' WHERE seq = 1"],
  ["payload", "UPDATE events SET payload_json = '{}' WHERE seq = 1"],
  ["this_hash", `UPDATE events SET this_hash = '${"f".repeat(64)}'`],
  ["tenant_id", "UPDATE events SET tenant_id = 'other' WHERE seq = 1"],
  ["ts", "UPDATE events SET ts = '2020-01-01T00:00:00.000Z'"],
];

describe("events is append-only, mechanically", () => {
  it.each(MUTATIONS)("aborts an UPDATE of %s", (_column, sql) => {
    const ledger = newLedger();
    ledger.writer.append(draft("verdict.emitted", { decision: "approve" }));
    expect(() => ledger.db.exec(sql)).toThrow(/E_LEDGER_IMMUTABLE/);
  });

  it.each([
    ["one row", "DELETE FROM events WHERE seq = 1"],
    ["every row", "DELETE FROM events"],
  ])("aborts a DELETE of %s", (_scope, sql) => {
    const ledger = newLedger();
    ledger.writer.append(draft("verdict.emitted", { decision: "approve" }));
    expect(() => ledger.db.exec(sql)).toThrow(/E_LEDGER_IMMUTABLE/);
  });

  it("leaves the row intact after a refused mutation", () => {
    const ledger = newLedger();
    const stored = ledger.writer.append(draft("txn.opened", { state: "open" }));
    expect(() => ledger.db.exec(MUTATIONS[0]?.[1] ?? "")).toThrow();
    expect(ledger.reader.readFrom(1, 10)[0]).toEqual(stored);
  });
});

describe("the chain guard refuses a fork", () => {
  it("rejects an insert that does not extend the head", () => {
    const ledger = newLedger();
    ledger.writer.append(draft("txn.opened", {}));
    const insert = ledger.db.prepare(
      `INSERT INTO events (seq, id, ts, ts_ms, tenant_id, actor, kind,
         payload_json, prev_hash, this_hash)
       VALUES (2, 'forked', '2026-08-31T00:00:00.000Z', 0, 'acme', 'attacker',
         'attack.detected', '{}', ?, ?)`,
    );
    expect(() => insert.run(GENESIS_HASH, "c".repeat(64))).toThrow(
      /E_LEDGER_FORK/,
    );
  });

  it("rejects a duplicated block through the this_hash unique index", () => {
    const ledger = newLedger();
    const first = ledger.writer.append(draft("txn.opened", {}));
    const insert = ledger.db.prepare(
      `INSERT INTO events (seq, id, ts, ts_ms, tenant_id, actor, kind,
         payload_json, prev_hash, this_hash)
       VALUES (2, 'copy', '2026-08-31T00:00:00.000Z', 0, 'acme', 'gateway',
         'txn.opened', '{}', ?, ?)`,
    );
    expect(() => insert.run(first.this_hash, first.this_hash)).toThrow(
      /UNIQUE constraint failed/,
    );
  });
});
