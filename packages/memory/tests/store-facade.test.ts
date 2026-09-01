import { expect, it } from "vitest";

import type { MemoryStore } from "@covenant/domain";

import { candidate, kindsOf } from "./builders.js";
import { USER_SIG } from "./fakes.js";
import { TENANT, USER, newStack, type Stack } from "./harness.js";

const EXPIRED_AT = "2026-09-01T00:00:00.000Z";

/**
 * Decision 5: the `MemoryStore` facade is pure wiring in the composition root,
 * so this is the compile-time proof that the two halves add up to the port.
 */
function facadeOf(stack: Stack): MemoryStore {
  return {
    put: (entry) => stack.writer.put(entry),
    getByIds: (tenantId, ids) => stack.reader.getByIds(tenantId, ids),
    liveConstraints: (tenantId, userId) =>
      stack.reader.liveConstraints(tenantId, userId),
    invalidate: (id, tExpired, supersededBy) =>
      stack.writer.invalidate(id, tExpired, supersededBy),
    search: (query) => stack.reader.search(query),
  };
}

it("the reader and writer halves satisfy the MemoryStore port", async () => {
  const stack = newStack();
  const store = facadeOf(stack);
  const written = await stack.gate.submit(
    candidate({
      type: "constraint",
      sourceChannel: "user_signed_mandate",
      sig: USER_SIG,
      subject: "user",
      predicate: "max_amount",
      content: { value: 200000 },
    }),
  );

  const id = written.memoryId ?? "";
  expect(store.getByIds(TENANT, [id]).map((entry) => entry.id)).toEqual([id]);
  expect(store.liveConstraints(TENANT, USER).map((entry) => entry.id)).toEqual([
    id,
  ]);
  const found = await store.search({
    tenantId: TENANT,
    userId: USER,
    query: "max amount",
    actionClass: "constraint-evaluation",
    limit: 10,
    asOf: null,
  });
  expect(found.map((entry) => entry.id)).toEqual([id]);
});

it("a ledgered invalidation replays byte-for-byte", async () => {
  const stack = newStack();
  const written = await stack.gate.submit(
    candidate({ subject: "sku_air", predicate: "price", content: { v: 1 } }),
  );
  expect(stack.reconciliation.run().ok).toBe(true);

  stack.txn.run("memory.invalidate", () => {
    stack.sink.append({
      tenant_id: TENANT,
      actor: "gateway",
      kind: "memory.invalidated",
      txn_id: null,
      request_id: null,
      mandate_id: null,
      payload: {
        memory_id: written.memoryId,
        t_expired: EXPIRED_AT,
        cause: "user_revoked",
      },
    });
    stack.writer.invalidate(written.memoryId ?? "", EXPIRED_AT, null);
  });

  expect(kindsOf(stack)).toContain("memory.invalidated");
  expect(stack.reconciliation.run().ok).toBe(true);
  expect(stack.reader.liveConstraints(TENANT, USER)).toEqual([]);
});
