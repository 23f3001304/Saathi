import { expect, it } from "vitest";

import type { MemorySearchQuery } from "@covenant/domain";

import {
  SCORE_WEIGHTS,
  TIER_WEIGHT,
  TYPE_PRIOR,
  VecIndex,
  lexicalSimilarity,
} from "../src/index.js";

import { candidate } from "./builders.js";
import { MERCHANT_SIG } from "./fakes.js";
import { TENANT, USER, newStack } from "./harness.js";

const HOUR_MS = 60 * 60 * 1000;

function chatFor(text: string): MemorySearchQuery {
  return {
    tenantId: TENANT,
    userId: USER,
    query: text,
    actionClass: "chat",
    limit: 20,
    asOf: null,
  };
}

it("a signed quote from an hour ago outranks an unsigned scrape from now", async () => {
  const stack = newStack();
  const signed = await stack.gate.submit(
    candidate({
      sourceChannel: "merchant_attestation",
      sig: MERCHANT_SIG,
      subject: "sku_air",
      predicate: "price",
      content: { label: "indigo runner", value: 149900 },
    }),
  );
  stack.clock.advance(HOUR_MS);
  const scraped = await stack.gate.submit(
    candidate({
      sourceChannel: "untrusted_text",
      subject: "sku_air_mirror",
      predicate: "label",
      content: { label: "indigo runner", value: 149900 },
    }),
  );

  const ids = (
    await stack.readGate.retrieve(chatFor("indigo runner"))
  ).entries.map((entry) => entry.id);
  expect(ids[0]).toBe(signed.memoryId);
  expect(ids).toContain(scraped.memoryId);
});

it("weights sum to one, so a score is a fraction", () => {
  const total =
    SCORE_WEIGHTS.cosine +
    SCORE_WEIGHTS.tier +
    SCORE_WEIGHTS.decay +
    SCORE_WEIGHTS.typePrior;
  expect(total).toBeCloseTo(1, 10);
});

it("a P0 entry contributes zero tier weight", () => {
  expect(TIER_WEIGHT[0]).toBe(0);
  expect(TIER_WEIGHT[3]).toBe(1);
});

it("prefers a constraint over an episode at equal everything else", () => {
  expect(TYPE_PRIOR.constraint).toBeGreaterThan(TYPE_PRIOR.episode);
});

it("reports sqlite-vec absent and degrades rather than throwing", async () => {
  const stack = newStack();
  const vec = new VecIndex(stack.db, null, stack.logger);
  expect(vec.available()).toBe(false);
  expect(await vec.embed("anything")).toBeNull();
  expect(vec.knn(null, 5)).toEqual([]);
  expect(() => vec.upsert("mem_1", null)).not.toThrow();
  const logged = stack.logger.lines.some(
    (line) => line.evt === "memory.vec.absent",
  );
  expect(logged).toBe(true);
});

it("falls back to the share of query tokens the entry carries", () => {
  expect(lexicalSimilarity("indigo running shoes", "indigo shoes")).toBeCloseTo(
    2 / 3,
    10,
  );
});

it("scores zero for an empty query and for no overlap", () => {
  expect(lexicalSimilarity("", "anything")).toBe(0);
  expect(lexicalSimilarity("aardvark", "indigo shoes")).toBe(0);
});
