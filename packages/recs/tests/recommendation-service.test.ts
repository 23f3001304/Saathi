import { describe, expect, it } from "vitest";

import {
  CandidateSource,
  KAnonymizer,
  MIN_K,
  PriceAnchorAnalyzer,
  RecommendationService,
  RegretWeighter,
} from "../src/index.js";
import { NoopTracer, ScriptedRandom } from "./fakes.js";
import { append, newStack, TENANT, USER } from "./harness.js";
import { seedMemory } from "./memory-fixtures.js";

const MERCHANT = "m1";
const SKU = "sku-a";

function serviceFor(stack: ReturnType<typeof newStack>): RecommendationService {
  return new RecommendationService(
    new CandidateSource(stack.memoryStore, null, stack.clock),
    new RegretWeighter(stack.db),
    new KAnonymizer(new ScriptedRandom([0.5])),
    new PriceAnchorAnalyzer(stack.db, stack.clock),
    new NoopTracer(),
  );
}

/** `sku-a`'s merchant has a clean quote history, and enough distinct
 * contributors to clear k >= MIN_K on their own — isolates the consent check
 * from the k-suppression check in the tests below. */
function seedTrustedSku(stack: ReturnType<typeof newStack>): void {
  seedMemory(stack, { id: "mem_a", type: "fact", tier: 1, subject: SKU, content: { text: "shoe", merchant_id: MERCHANT } });
  for (let i = 0; i < MIN_K; i += 1) {
    append(stack, "regret.recorded", { user_id: `other_${i}`, txn_id: `txn_other_${i}`, verdict: "keep", note: null }, `txn_other_${i}`);
  }
  for (let i = 0; i < 20; i += 1) {
    append(stack, "catalog.quote.received", { merchant_id: MERCHANT, sku_id: SKU, total_paise: 100, quote_jti: `q${i}` });
  }
  stack.runner.runPending();
}

function grantConsent(stack: ReturnType<typeof newStack>): void {
  seedMemory(stack, {
    id: "mem_consent",
    type: "constraint",
    tier: 3,
    subject: "user",
    predicate: "share_aggregates",
    content: { value: true },
    sourceChannel: "user_signed_mandate",
  });
}

async function baseScoreOf(stack: ReturnType<typeof newStack>): Promise<number> {
  const candidates = new CandidateSource(stack.memoryStore, null, stack.clock);
  const raw = await candidates.findCandidates({ tenantId: TENANT, userId: USER, category: "shoe", queryText: "shoe", limit: 5 });
  return raw.find((c) => c.skuId === SKU)?.score ?? NaN;
}

describe("RecommendationService.recommend — basic serving", () => {
  it("returns provenance-eligible facts as items, sorted by score", async () => {
    const stack = newStack();
    seedMemory(stack, { id: "mem_1", type: "fact", tier: 1, subject: SKU, content: { text: "running shoe" } });
    const response = await serviceFor(stack).recommend({ tenantId: TENANT, userId: USER, category: "running shoe", limit: 5 });

    expect(response.sort_key).toBe("score");
    expect(response.items.map((item) => item.sku_id)).toContain(SKU);
  });
});

describe("RecommendationService.recommend — the consent gate (ARCHITECTURE §5.8)", () => {
  it("off: the merchant-trust aggregate never moves the score", async () => {
    const stack = newStack();
    seedTrustedSku(stack); // consent withheld — the only thing gating here
    const base = await baseScoreOf(stack);

    const response = await serviceFor(stack).recommend({ tenantId: TENANT, userId: USER, category: "shoe", limit: 5 });
    const item = response.items.find((entry) => entry.sku_id === SKU);

    expect(response.k_anonymity.suppressed).toBe(false); // contributors are plentiful...
    // ...but no consent means no aggregate multiplier; the two calls land a
    // clock tick apart (an auto-advancing test clock), so compare loosely
    // rather than bit-for-bit — a real aggregate boost moves this by ~40%.
    expect(item?.score).toBeCloseTo(base, 4);
  });

  it("on: the same merchant-trust aggregate now lifts the score", async () => {
    const stack = newStack();
    seedTrustedSku(stack);
    grantConsent(stack);
    const base = await baseScoreOf(stack);

    const response = await serviceFor(stack).recommend({ tenantId: TENANT, userId: USER, category: "shoe", limit: 5 });
    const item = response.items.find((entry) => entry.sku_id === SKU);

    expect(response.k_anonymity.suppressed).toBe(false);
    expect(item?.score).toBeGreaterThan(base);
  });

  it("reports suppressed when too few contributors back the aggregate, even with consent", async () => {
    const stack = newStack();
    grantConsent(stack);
    seedMemory(stack, { id: "mem_a", type: "fact", tier: 1, subject: SKU, content: { text: "shoe", merchant_id: MERCHANT } });

    const response = await serviceFor(stack).recommend({ tenantId: TENANT, userId: USER, category: "shoe", limit: 5 });
    expect(response.k_anonymity).toEqual({ k: 0, suppressed: true });
  });
});
