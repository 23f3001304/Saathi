// A live run typed "do you have a 1tb ssd" at a shop that sells shoes and
// kurtas, and the drafter answered with the cheapest row it had — a three-pack
// of socks — so a human was shown "do you have a 1tb ssd — at most 5000.00 INR,
// apparel, refundable only." and asked to sign it. A draft names something the
// shopper asked for, or there is no draft.
import type { AgentSession } from "@covenant/agents";
import {
  DEMO_CATALOG,
  INTENT_DRAFT_PROMPT_ID,
  POISONED_SKU,
} from "@covenant/agents";
import type { PromptInput, ResponseSchema } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import {
  chooseSku,
  matchedSku,
  NothingStocked,
} from "../src/judge/catalog-match.js";
import { SessionPromptJudge } from "../src/judge/session-prompt-judge.js";
import { StaticPromptJudge } from "../src/judge/static-prompt-judge.js";
import { RecordingLogger } from "./support/fakes.js";

const SSD = "do you have a 1tb ssd";

const SHOES = "A pair of road running shoes under 2500, refundable.";

const T1 =
  "Buy the trail shoe KR-TRAIL-42 from Kolam Run if it fits my budget.";

const CONFIG = {
  merchantIss: "urn:covenant:merchant:kolam-run",
  capPaise: 500_000,
  currency: "INR",
};

const echo: ResponseSchema<Record<string, unknown>> = (value) =>
  value as Record<string, unknown>;

function draftInput(request: string): PromptInput {
  return { conversation: [request], currency: "INR" };
}

const DEMO_SHELF = { current: () => DEMO_CATALOG };

function drafterFor(request: string): Promise<Record<string, unknown>> {
  return new StaticPromptJudge(DEMO_SHELF, CONFIG).judge(
    INTENT_DRAFT_PROMPT_ID,
    draftInput(request),
    echo,
    { timeoutMs: 1000 },
  );
}

describe("choosing a listing for a request the shop cannot serve", () => {
  it("names nothing rather than the nearest row", () => {
    expect(matchedSku(DEMO_CATALOG, SSD)).toBeNull();
  });

  it("does not fall through to the cheapest unrelated listing", () => {
    const cheapest = [...DEMO_CATALOG].sort(
      (left, right) => left.listPricePaise - right.listPricePaise,
    )[0];
    expect(cheapest?.sku).toBe("KR-SOCK-3P");
    expect(matchedSku(DEMO_CATALOG, SSD)?.sku).not.toBe(cheapest?.sku);
  });

  it("refuses, carrying the request the refusal is about", () => {
    expect(() => chooseSku(DEMO_CATALOG, SSD)).toThrow(NothingStocked);
    try {
      chooseSku(DEMO_CATALOG, SSD);
    } catch (cause) {
      expect((cause as NothingStocked).request).toBe(SSD);
    }
  });

  it("is still refused when the catalog is empty", () => {
    expect(matchedSku([], SHOES)).toBeNull();
  });
});

describe("choosing a listing the shop does stock", () => {
  it("still chooses on what the shopper said", () => {
    expect(matchedSku(DEMO_CATALOG, SHOES)?.category).toBe("footwear");
  });

  it("still lets an explicit SKU code win outright, as the T-1 run needs", () => {
    expect(matchedSku(DEMO_CATALOG, T1)?.sku).toBe(POISONED_SKU);
    expect(chooseSku(DEMO_CATALOG, T1).sku).toBe(POISONED_SKU);
  });

  it("resolves a named SKU whose words match nothing the shopper typed", () => {
    expect(matchedSku(DEMO_CATALOG, "get me ST-KURTA-NAVY-M")?.sku).toBe(
      "ST-KURTA-NAVY-M",
    );
  });
});

describe("the deterministic drafter", () => {
  it("refuses to draft anything for a request the shop cannot serve", async () => {
    await expect(drafterFor(SSD)).rejects.toBeInstanceOf(NothingStocked);
  });

  it("never names an apparel SKU for a storage request", async () => {
    expect(await drafterFor(SSD).catch(() => null)).toBeNull();
  });

  it("still drafts, and names the right listing, for what the shop sells", async () => {
    const drafted = await drafterFor(SHOES);
    expect(drafted["skus"]).toEqual(["ASC-GC9-UK8"]);
    expect(drafted["natural_language_description"]).toContain("footwear");
  });
});

/** A model that cannot answer, so the run falls through to the floor. */
const MUTE: AgentSession = {
  turn: () => Promise.reject(new Error("no provider reachable")),
} as unknown as AgentSession;

function liveDrafterFor(request: string): Promise<Record<string, unknown>> {
  const judge = new SessionPromptJudge(
    MUTE,
    new StaticPromptJudge(DEMO_SHELF, CONFIG),
    new RecordingLogger(),
    CONFIG.merchantIss,
    DEMO_SHELF,
  );
  return judge.judge(INTENT_DRAFT_PROMPT_ID, draftInput(request), echo, {
    timeoutMs: 1000,
  });
}

describe("the live drafter falling back onto a refusal", () => {
  it("surfaces the refusal as itself, not as a generic failure", async () => {
    await expect(liveDrafterFor(SSD)).rejects.toBeInstanceOf(NothingStocked);
  });

  it("still reaches the floor and drafts for a request the shop can serve", async () => {
    expect((await liveDrafterFor(SHOES))["skus"]).toEqual(["ASC-GC9-UK8"]);
  });
});
