import { expect, it } from "vitest";

import { candidate, kindsOf, liveRowCount } from "./builders.js";
import { MERCHANT_SIG } from "./fakes.js";
import { newStack, type Stack } from "./harness.js";

// Bi-temporal supersede races (§5.2 f): higher tier wins; an equal tier is
// broken by the later `t_created`; a lower-tier non-contradicting write is
// committed as `shadowed` rather than discarded (decision 29).

const MINUTE_MS = 60 * 1000;
const KEY = { subject: "sku_air", predicate: "price" };

function rowOf(stack: Stack, id: string): Record<string, unknown> {
  return stack.db
    .prepare("SELECT t_expired, superseded_by FROM memory WHERE id = ?")
    .get(id) as Record<string, unknown>;
}

const p1 = (value: number) =>
  candidate({ ...KEY, content: { value }, sourceChannel: "verified_api" });

const p2 = (value: number) =>
  candidate({
    ...KEY,
    content: { value },
    sourceChannel: "merchant_attestation",
    sig: MERCHANT_SIG,
  });

it("a higher tier supersedes the live lower-tier row", async () => {
  const stack = newStack();
  const first = await stack.gate.submit(p1(100000));
  stack.clock.advance(MINUTE_MS);
  const second = await stack.gate.submit(p2(149900));

  expect(second.status).toBe("committed");
  expect(second.superseded).toEqual([first.memoryId]);
  expect(rowOf(stack, first.memoryId ?? "")).toMatchObject({
    superseded_by: second.memoryId,
  });
  expect(kindsOf(stack)).toEqual([
    "memory.write.committed",
    "memory.write.committed",
    "memory.write.superseded",
  ]);
});

it("tier beats recency: a later lower-tier write is shadowed, not discarded", async () => {
  const stack = newStack();
  const signed = await stack.gate.submit(p2(149900));
  stack.clock.advance(MINUTE_MS);
  const unsigned = await stack.gate.submit(p1(129900));

  expect(unsigned.status).toBe("shadowed");
  expect(unsigned.superseded).toEqual([]);
  expect(unsigned.memoryId).not.toBeNull();
  expect(rowOf(stack, signed.memoryId ?? "")["t_expired"]).toBeNull();
  expect(liveRowCount(stack)).toBe(2);
  expect(kindsOf(stack)).toEqual([
    "memory.write.committed",
    "memory.write.shadowed",
  ]);
});

it("equal tier: the later t_created wins", async () => {
  const stack = newStack();
  const first = await stack.gate.submit(p1(100000));
  stack.clock.advance(MINUTE_MS);
  const second = await stack.gate.submit(p1(120000));

  expect(second.superseded).toEqual([first.memoryId]);
  expect(liveRowCount(stack)).toBe(1);
});

it("equal tier: an earlier t_created is shadowed", async () => {
  const stack = newStack();
  stack.clock.set(new Date("2026-08-31T13:00:00.000Z"));
  const later = await stack.gate.submit(p1(100000));
  stack.clock.set(new Date("2026-08-31T12:00:00.000Z"));
  const backdated = await stack.gate.submit(p1(120000));

  expect(backdated.status).toBe("shadowed");
  expect(rowOf(stack, later.memoryId ?? "")["t_expired"]).toBeNull();
  expect(liveRowCount(stack)).toBe(2);
});

it("a P0 write cannot supersede an equal-tier live row", async () => {
  const stack = newStack();
  const first = await stack.gate.submit(
    candidate({ ...KEY, sourceChannel: "untrusted_text", content: { v: 1 } }),
  );
  expect(first.status).toBe("quarantined");
  stack.clock.advance(MINUTE_MS);
  const second = await stack.gate.submit(
    candidate({ ...KEY, sourceChannel: "untrusted_text", content: { v: 2 } }),
  );
  expect(second.status).toBe("rejected");
  expect(second.reasonCode).toBe("TYPE_REQUIRES_HIGHER_TIER");
});

it("episodes are append-only: two turns, no supersede, no dedupe", async () => {
  const stack = newStack();
  const turn = {
    type: "episode" as const,
    subject: "sess_1",
    predicate: "turn",
  };
  const first = await stack.gate.submit(
    candidate({ ...turn, content: { text: "hello" } }),
  );
  stack.clock.advance(MINUTE_MS);
  const second = await stack.gate.submit(
    candidate({ ...turn, content: { text: "hello" } }),
  );

  expect(first.status).toBe("committed");
  expect(second.status).toBe("committed");
  expect(second.deduped).toBe(false);
  expect(second.superseded).toEqual([]);
  expect(liveRowCount(stack)).toBe(2);
});

it("aborts a DELETE with E_MEMORY_IMMUTABLE", async () => {
  const stack = newStack();
  await stack.gate.submit(p1(100000));
  expect(() => stack.db.prepare("DELETE FROM memory").run()).toThrow(
    /E_MEMORY_IMMUTABLE/,
  );
});

it("aborts an UPDATE of a frozen column", async () => {
  const stack = newStack();
  const written = await stack.gate.submit(p1(100000));
  expect(() =>
    stack.db
      .prepare("UPDATE memory SET tier = 3 WHERE id = ?")
      .run(written.memoryId),
  ).toThrow(/E_MEMORY_IMMUTABLE/);
});
