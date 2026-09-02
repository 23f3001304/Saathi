// Scripted mode has no model; the fake one reads the sentence against the
// shelf. It names something the shopper asked for, or it names nothing: a
// request this shop cannot serve must never draft the cheapest row.
import { DEMO_CATALOG, INTENT_DRAFT_PROMPT_ID, POISONED_SKU } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import {
  chooseSku,
  matchedSku,
  NothingStocked,
} from "../src/session/catalog-match.js";
import { StaticPromptJudge } from "../src/session/static-prompt-judge.js";

const SSD = "do you have a 1tb ssd";

const CONFIG = {
  merchantIss: "urn:covenant:merchant:kolam-run",
  capPaise: 500_000,
  currency: "INR",
};

const echo = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

describe("the scripted fake model reading the shelf", () => {
  it("names nothing rather than the nearest row", () => {
    expect(matchedSku(DEMO_CATALOG, SSD)).toBeNull();
  });

  it("refuses, carrying the request the refusal is about", () => {
    expect(() => chooseSku(DEMO_CATALOG, SSD)).toThrow(NothingStocked);
  });

  it("takes an explicit sku code ahead of the matcher", () => {
    expect(matchedSku(DEMO_CATALOG, `buy the ${POISONED_SKU}`)?.sku).toBe(
      POISONED_SKU,
    );
  });

  it("drafts nothing for a request the shop cannot serve", async () => {
    const judge = new StaticPromptJudge({ current: () => DEMO_CATALOG }, CONFIG);
    await expect(
      judge.judge(INTENT_DRAFT_PROMPT_ID, { conversation: [SSD], currency: "INR" }, echo),
    ).rejects.toBeInstanceOf(NothingStocked);
  });
});
