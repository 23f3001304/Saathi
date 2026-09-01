import { beforeEach, expect, it } from "vitest";

import type { ActionClass, MemorySearchQuery, Tier } from "@covenant/domain";
import { MEMORY_DIGEST_ALG } from "@covenant/domain";

import { candidate } from "./builders.js";
import { SEEDS } from "./read-gate-seeds.js";
import { TENANT, USER, newStack, type Stack } from "./harness.js";

interface ClassRow {
  readonly actionClass: ActionClass;
  readonly visible: readonly string[];
  readonly tierFloor: Tier;
  readonly digest: boolean;
}

/** §9.3's read-gate table: what a retrieval is *for* decides what it sees. */
const CLASSES: readonly ClassRow[] = [
  {
    actionClass: "chat",
    visible: [
      "constraint",
      "preference",
      "price",
      "quarantined",
      "episode",
      "procedure",
    ],
    tierFloor: 0,
    digest: false,
  },
  {
    actionClass: "cart-construction",
    visible: ["constraint", "preference", "price", "procedure"],
    tierFloor: 1,
    digest: true,
  },
  {
    actionClass: "constraint-evaluation",
    visible: ["constraint"],
    tierFloor: 3,
    digest: true,
  },
  {
    actionClass: "price-history",
    visible: ["price"],
    tierFloor: 2,
    digest: false,
  },
  {
    actionClass: "recs-training",
    visible: ["preference", "price", "episode"],
    tierFloor: 1,
    digest: false,
  },
];

let stack: Stack;
let ids: Map<string, string>;

function query(actionClass: ActionClass): MemorySearchQuery {
  return {
    tenantId: TENANT,
    userId: USER,
    query: "indigo shoes price limit",
    actionClass,
    limit: 50,
    asOf: null,
  };
}

beforeEach(async () => {
  stack = newStack();
  ids = new Map();
  for (const seed of SEEDS) {
    const result = await stack.gate.submit(candidate(seed.over));
    expect(result.memoryId).not.toBeNull();
    ids.set(seed.key, result.memoryId ?? "");
  }
});

it.each(CLASSES)(
  "$actionClass sees exactly its allowed entries",
  async (row: ClassRow) => {
    const found = await stack.readGate.retrieve(query(row.actionClass));
    const seen = new Set(found.entries.map((entry) => entry.id));
    expect(seen).toEqual(
      new Set(row.visible.map((key) => ids.get(key) ?? key)),
    );
    expect(found.tierFloor).toBe(row.tierFloor);
    expect(found.digestAlg).toBe(MEMORY_DIGEST_ALG);
    expect(found.digest === null).toBe(!row.digest);
  },
);

it("constraint-evaluation applies no decay (decision 40)", async () => {
  const found = await stack.readGate.retrieve(query("constraint-evaluation"));
  expect(found.entries[0]?.decayWeight).toBe(1);
});

it("chat flags the quarantined row rather than hiding it", async () => {
  const found = await stack.readGate.retrieve(query("chat"));
  const flagged = found.entries.filter((entry) => entry.quarantined);
  expect(flagged.map((entry) => entry.id)).toEqual([ids.get("quarantined")]);
});

it("orders by tier once similarity ties at zero", async () => {
  const found = await stack.readGate.retrieve({
    ...query("chat"),
    query: "aardvark",
  });
  const tiers = found.entries.map((entry) => entry.tier);
  expect(tiers[0]).toBe(3);
  expect(tiers.at(-1)).toBe(0);
  expect([...tiers].sort((left, right) => right - left)).toEqual(tiers);
});

it("ledgers memory.retrieved with the ids and the digest", async () => {
  const found = await stack.readGate.retrieve(query("cart-construction"));
  const event = stack.events
    .readFrom(1, 100)
    .find((row) => row.kind === "memory.retrieved");
  expect(event?.payload["digest"]).toBe(found.digest);
  expect(event?.payload["tier_floor"]).toBe(1);
  expect(event?.payload["entry_ids"]).toEqual(
    found.entries.map((entry) => entry.id),
  );
});

it("truncates to the requested limit", async () => {
  const found = await stack.readGate.retrieve({ ...query("chat"), limit: 2 });
  expect(found.entries).toHaveLength(2);
});

it("price-history slices bi-temporally on as_of", async () => {
  const before = await stack.readGate.retrieve({
    ...query("price-history"),
    asOf: "2026-08-30T00:00:00.000Z",
  });
  expect(before.entries).toEqual([]);

  const after = await stack.readGate.retrieve({
    ...query("price-history"),
    asOf: "2026-09-01T00:00:00.000Z",
  });
  expect(after.entries.map((entry) => entry.id)).toEqual([ids.get("price")]);
});

it("recomputes the digest independently of retrieval order", async () => {
  const first = await stack.readGate.retrieve(query("cart-construction"));
  const second = await stack.readGate.retrieve({
    ...query("cart-construction"),
    query: "limit price",
  });
  expect(second.digest).toBe(first.digest);
});
