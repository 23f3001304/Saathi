import { describe, expect, it } from "vitest";

import { draft, newLedger } from "./harness.js";
import type { Ledger } from "./harness.js";

function seed(ledger: Ledger, count: number): void {
  ledger.txn.run("seed", () => {
    for (let index = 0; index < count; index += 1) {
      ledger.writer.append(
        draft("verdict.emitted", { decision: "approve", index }, "txn_a"),
      );
    }
  });
}

/**
 * The triggers stop the application; the chain is what stops someone who can
 * reach the file. Dropping the trigger first is the only honest way to test
 * the second claim.
 */
function tamper(ledger: Ledger, sql: string): void {
  ledger.db.exec("DROP TRIGGER events_no_update");
  ledger.db.exec(sql);
}

const HEADER_EDITS: readonly (readonly [string, string])[] = [
  ["actor", "UPDATE events SET actor = 'user' WHERE seq = 3"],
  ["kind", "UPDATE events SET kind = 'payment.captured' WHERE seq = 3"],
  ["tenant_id", "UPDATE events SET tenant_id = 'evil' WHERE seq = 3"],
  ["request_id", "UPDATE events SET request_id = 'req-x' WHERE seq = 3"],
  ["mandate_id", "UPDATE events SET mandate_id = 'urn:uuid:x' WHERE seq = 3"],
  ["txn_id", "UPDATE events SET txn_id = 'txn_b' WHERE seq = 3"],
  ["ts", "UPDATE events SET ts = '2020-01-01T00:00:00.000Z' WHERE seq = 3"],
  ["id", "UPDATE events SET id = 'rewritten' WHERE seq = 3"],
];

describe("chain verification", () => {
  it("passes on an intact ledger and reports its height", () => {
    const ledger = newLedger();
    seed(ledger, 5);
    const result = ledger.verifier.verify();
    expect(result.ok).toBe(true);
    expect(result.height).toBe(5);
    expect(result.firstDivergentSeq).toBeNull();
    expect(result.headHash).toBe(ledger.reader.head()?.this_hash);
  });

  it("passes on an empty ledger", () => {
    const result = newLedger().verifier.verify();
    expect(result).toMatchObject({ ok: true, height: 0 });
  });
});

describe("a rewritten header field is caught, not just a rewritten payload", () => {
  it.each(HEADER_EDITS)("catches an in-place edit of %s", (_field, sql) => {
    const ledger = newLedger();
    seed(ledger, 5);
    tamper(ledger, sql);
    const result = ledger.verifier.verify();
    expect(result.ok).toBe(false);
    expect(result.firstDivergentSeq).toBe(3);
  });

  it("catches a rewritten payload", () => {
    const ledger = newLedger();
    seed(ledger, 5);
    tamper(ledger, "UPDATE events SET payload_json = '{}' WHERE seq = 4");
    expect(ledger.verifier.verify().firstDivergentSeq).toBe(4);
  });

  it("catches a gap punched in the sequence", () => {
    const ledger = newLedger();
    seed(ledger, 5);
    ledger.db.exec("DROP TRIGGER events_no_delete");
    ledger.db.exec("DELETE FROM events WHERE seq = 3");
    expect(ledger.verifier.verify().firstDivergentSeq).toBe(4);
  });

  it("reports only the first divergence, in seq order", () => {
    const ledger = newLedger();
    seed(ledger, 6);
    tamper(ledger, "UPDATE events SET actor = 'user' WHERE seq IN (2, 5)");
    expect(ledger.verifier.verify().firstDivergentSeq).toBe(2);
  });

  it("scopes to one transaction for the audit view", () => {
    const ledger = newLedger();
    seed(ledger, 3);
    expect(ledger.verifier.verifyTxn("txn_a")).toBe(true);
    tamper(ledger, "UPDATE events SET kind = 'catalog.read' WHERE seq = 2");
    expect(ledger.verifier.verifyTxn("txn_a")).toBe(false);
  });
});
