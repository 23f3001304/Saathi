import { beforeEach, expect, it } from "vitest";

import { candidate, kindsOf } from "./builders.js";
import { MERCHANT_SIG, USER_SIG } from "./fakes.js";
import { newStack, type Stack } from "./harness.js";

// Reconciliation (§9.6): re-fold into a shadow, diff, report — never heal.

const MINUTE_MS = 60 * 1000;
const FLIP = "2026-09-01T00:00:00.000Z";

let stack: Stack;
let quoteId: string;

const KEY = { subject: "sku_air", predicate: "price" };

async function seedConstraint(): Promise<void> {
  await stack.gate.submit(
    candidate({
      type: "constraint",
      sourceChannel: "user_signed_mandate",
      sig: USER_SIG,
      subject: "user",
      predicate: "max_amount",
      content: { value: 200000 },
    }),
  );
}

/** A commit, a supersede and a shadow, so the replay has every branch. */
async function seedQuotes(): Promise<string> {
  const quote = await stack.gate.submit(
    candidate({ ...KEY, content: { value: 159900 } }),
  );
  stack.clock.advance(MINUTE_MS);
  await stack.gate.submit(
    candidate({
      ...KEY,
      sourceChannel: "merchant_attestation",
      sig: MERCHANT_SIG,
      content: { value: 149900 },
    }),
  );
  stack.clock.advance(MINUTE_MS);
  await stack.gate.submit(
    candidate({
      ...KEY,
      sourceChannel: "untrusted_text",
      content: { value: 99900 },
    }),
  );
  return quote.memoryId ?? "";
}

function flipOutOfBand(): void {
  // A tamper the triggers allow — `t_expired` is mutable — but that no ledger
  // event ever justified. This is exactly what the N3 proof exists to catch.
  stack.db
    .prepare("UPDATE memory SET t_expired = ? WHERE id = ?")
    .run(FLIP, quoteId);
}

beforeEach(async () => {
  stack = newStack();
  await seedConstraint();
  quoteId = await seedQuotes();
});

it("replays the memory fold byte-for-byte and reports ok", () => {
  const report = stack.reconciliation.run();
  expect(report.ok).toBe(true);
  expect(report.drift).toEqual([]);
  expect(report.tables).toEqual(["memory"]);
  expect(kindsOf(stack).at(-1)).toBe("reconciliation.ok");
  expect(stack.drift.isDrifting()).toBe(false);
});

it("detects an out-of-band t_expired flip", () => {
  expect(stack.reconciliation.run().ok).toBe(true);
  flipOutOfBand();

  const report = stack.reconciliation.run();
  expect(report.ok).toBe(false);
  expect(report.drift.map((entry) => entry.table)).toEqual(["memory"]);
  expect(report.drift[0]?.liveHash).not.toBe(report.drift[0]?.replayedHash);
  expect(kindsOf(stack).at(-1)).toBe("reconciliation.drift");
});

it("never auto-heals the drifted row", () => {
  flipOutOfBand();
  stack.reconciliation.run();
  stack.reconciliation.run();

  const row = stack.db
    .prepare("SELECT t_expired FROM memory WHERE id = ?")
    .get(quoteId) as { t_expired: string | null };
  expect(row.t_expired).toBe(FLIP);
});

it("degrades selectively: memory drift blocks cart construction only", () => {
  flipOutOfBand();
  stack.reconciliation.run();

  expect(stack.drift.memoryDrifted()).toBe(true);
  expect(stack.drift.permits("cart-construction")).toBe(false);
  expect(stack.drift.permits("constraint-evaluation")).toBe(false);
  expect(stack.drift.permits("chat")).toBe(true);
  expect(stack.drift.permits("recs-training")).toBe(true);
});

it("carries the row-count sample into the drift event", () => {
  flipOutOfBand();
  stack.reconciliation.run();

  const event = stack.events
    .readFrom(1, 200)
    .findLast((row) => row.kind === "reconciliation.drift");
  expect(event?.payload["row_diff_sample"]).toMatchObject([
    { table: "memory", live_rows: 4, replayed_rows: 4 },
  ]);
  expect(event?.payload["first_divergent_seq"]).toBeNull();
});
