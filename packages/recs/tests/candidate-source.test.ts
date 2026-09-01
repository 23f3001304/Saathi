import type { MemoryEntry } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { CandidateSource } from "../src/index.js";
import { FakeEmbedder, FakeMemoryStore, FixedClock } from "./fakes.js";
import { newStack, TENANT, USER } from "./harness.js";
import { seedMemory } from "./memory-fixtures.js";

function bareEntry(overrides: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: "mem_bare",
    tenantId: TENANT,
    userId: USER,
    type: "fact",
    tier: 0,
    quarantined: false,
    subject: "sku-bare",
    predicate: null,
    content: { text: "bare" },
    contentHash: "a".repeat(64),
    entryHash: "b".repeat(64),
    sourceChannel: "untrusted_text",
    sourceRef: null,
    tValid: "2026-08-01T00:00:00.000Z",
    tInvalid: null,
    tCreated: "2026-08-01T00:00:00.000Z",
    tExpired: null,
    supersededBy: null,
    writeEventId: "evt_1",
    ...overrides,
  };
}

describe("CandidateSource — defense in depth against a permissive store", () => {
  it("still refuses a P0 entry even when the store itself applies no filtering", async () => {
    const permissive = new FakeMemoryStore([
      bareEntry({ id: "mem_p0", tier: 0, subject: "sku-poison" }),
      bareEntry({ id: "mem_p1", tier: 1, subject: "sku-legit" }),
    ]);
    const source = new CandidateSource(permissive, null, new FixedClock());
    const ranked = await source.findCandidates({
      tenantId: TENANT,
      userId: USER,
      category: null,
      queryText: "bare",
      limit: 10,
    });
    expect(ranked.map((c) => c.skuId)).toEqual(["sku-legit"]);
  });
});

describe("CandidateSource — provenance filtering: P0 exclusion (ARCHITECTURE §5.8)", () => {
  it("never surfaces a P0 fact, even when it is the only lexical match", () => {
    const stack = newStack();
    seedMemory(stack, {
      id: "mem_p0",
      type: "fact",
      tier: 0,
      subject: "sku-poison",
      content: { text: "running shoe running shoe running shoe" },
      sourceChannel: "untrusted_text",
      quarantined: true,
    });
    seedMemory(stack, {
      id: "mem_p1",
      type: "fact",
      tier: 1,
      subject: "sku-legit",
      content: { text: "trail shoe" },
      sourceChannel: "verified_api",
    });

    const source = new CandidateSource(stack.memoryStore, null, new FixedClock());
    return source
      .findCandidates({ tenantId: TENANT, userId: USER, category: null, queryText: "running shoe", limit: 10 })
      .then((ranked) => {
        expect(ranked.map((c) => c.skuId)).not.toContain("sku-poison");
        expect(ranked.map((c) => c.skuId)).toContain("sku-legit");
      });
  });
});

describe("CandidateSource — provenance filtering: tier x type eligibility", () => {
  it.each([
    ["fact at P0 is excluded", "fact", 0, false],
    ["fact at P1 is eligible", "fact", 1, true],
    ["preference at P1 is excluded (only P3 preferences serve)", "preference", 1, false],
    ["preference at P2 is excluded (only P3 preferences serve)", "preference", 2, false],
    ["preference at P3 is eligible", "preference", 3, true],
  ] as const)("%s", async (_name, type, tier, eligible) => {
    const stack = newStack();
    seedMemory(stack, {
      id: `mem_${type}_${tier}`,
      type,
      tier,
      subject: "sku-x",
      content: { text: "trail running shoe" },
      sourceChannel: "verified_api",
    });
    const source = new CandidateSource(stack.memoryStore, null, new FixedClock());
    const ranked = await source.findCandidates({
      tenantId: TENANT,
      userId: USER,
      category: null,
      queryText: "trail running shoe",
      limit: 10,
    });
    expect(ranked.some((c) => c.skuId === "sku-x")).toBe(eligible);
  });
});

describe("CandidateSource — provenance filtering: episodes never serve", () => {
  it("excludes an episode outright — only facts and preferences ever serve", async () => {
    const stack = newStack();
    seedMemory(stack, {
      id: "mem_ep",
      type: "episode",
      tier: 3,
      subject: "sku-x",
      content: { text: "trail running shoe" },
      sourceChannel: "user_signed_mandate",
    });
    const source = new CandidateSource(stack.memoryStore, null, new FixedClock());
    const ranked = await source.findCandidates({
      tenantId: TENANT,
      userId: USER,
      category: null,
      queryText: "trail running shoe",
      limit: 10,
    });
    expect(ranked).toEqual([]);
  });
});

describe("CandidateSource — similarity ranking", () => {
  it("ranks a strong embedding match above a weak one when an Embedder is wired", async () => {
    const stack = newStack();
    seedMemory(stack, { id: "mem_close", type: "fact", tier: 1, subject: "sku-close", content: { text: "trail running shoe" } });
    seedMemory(stack, { id: "mem_far", type: "fact", tier: 1, subject: "sku-far", content: { text: "kitchen blender" } });

    const source = new CandidateSource(stack.memoryStore, new FakeEmbedder(), new FixedClock());
    const ranked = await source.findCandidates({
      tenantId: TENANT,
      userId: USER,
      category: null,
      queryText: "trail running shoe",
      limit: 10,
    });
    expect(ranked[0]?.skuId).toBe("sku-close");
  });

  it("falls back to lexical similarity with no Embedder wired", async () => {
    const stack = newStack();
    seedMemory(stack, { id: "mem_close", type: "fact", tier: 1, subject: "sku-close", content: { text: "trail running shoe" } });
    seedMemory(stack, { id: "mem_far", type: "fact", tier: 1, subject: "sku-far", content: { text: "kitchen blender" } });

    const source = new CandidateSource(stack.memoryStore, null, new FixedClock());
    const ranked = await source.findCandidates({
      tenantId: TENANT,
      userId: USER,
      category: null,
      queryText: "trail running shoe",
      limit: 10,
    });
    expect(ranked[0]?.skuId).toBe("sku-close");
  });
});

describe("CandidateSource.hasShareAggregatesConsent", () => {
  it("is false with no live share_aggregates constraint", () => {
    const stack = newStack();
    const source = new CandidateSource(stack.memoryStore, null, new FixedClock());
    expect(source.hasShareAggregatesConsent(TENANT, USER)).toBe(false);
  });

  it("is true once the user's P3 constraint is live", () => {
    const stack = newStack();
    seedMemory(stack, {
      id: "mem_consent",
      type: "constraint",
      tier: 3,
      subject: "user",
      predicate: "share_aggregates",
      content: { value: true },
      sourceChannel: "user_signed_mandate",
    });
    const source = new CandidateSource(stack.memoryStore, null, new FixedClock());
    expect(source.hasShareAggregatesConsent(TENANT, USER)).toBe(true);
  });
});
