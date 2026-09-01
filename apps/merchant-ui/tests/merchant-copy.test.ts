import { describe, expect, it } from "vitest";

import { briefingFor } from "../src/advisor/briefing.ts";
import { reasonsFor } from "../src/advisor/standingReasons.ts";
import { opening, plural } from "../src/primitives/plural.ts";
import { localTransport } from "../src/assistant/transport.ts";
import { shopContext } from "./shopContext.ts";
import type {
  LeakageView,
  ListingAuditView,
  StandingView,
} from "../src/api/merchantTypes.ts";

/** A count followed by a plural noun: "1 things", "1 listings", "1 times". */
const BROKEN = /\b1 [a-z]+s\b/;

const COUNTERS = {
  quotesTotal: 1,
  quoteMismatches: 1,
  catalogReads: 1,
  manipulationAttempts: 1,
  refundsRequested: 1,
  refundsHonored: 0,
  cooloffCancellations: 1,
  cartsTotal: 1,
};

const ONE_AUDIT: ListingAuditView = {
  listings: [
    {
      itemId: "item_one",
      name: "Nilgiri handloom stole",
      cues: [
        { kind: "scarcity", phrase: "only 2 left", bias: "", counter: "" },
      ],
    },
  ],
  byKind: { scarcity: 1 },
  clean: 0,
  live: true,
};

const ONE_LEAKAGE: LeakageView = {
  refusals: [{ reasonCode: "QUOTE_EXPIRED", count: 1 }],
  counters: COUNTERS,
  stockConflicts: 1,
  live: true,
};

const ONE_STANDING: StandingView = {
  merchant: "kolam-run",
  score: 0.5,
  observations: 1,
  priorPseudoCount: 8,
  priorScore: 0.5,
  contributions: [],
  counters: COUNTERS,
  stockConflicts: 1,
};

describe("counts that agree with their nouns", () => {
  it("says one of a thing without a plural noun behind it", () => {
    expect(plural(1, "listing")).toBe("1 listing");
    expect(plural(2, "listing")).toBe("2 listings");
    expect(opening(1, "refund")).toBe("One refund");
    expect(opening(3, "refund")).toBe("3 refunds");
  });
});

describe("the briefing, when every count is one", () => {
  const items = briefingFor({
    standing: ONE_STANDING,
    audit: ONE_AUDIT,
    demand: {
      unmet: [{ query: "linen shirt", asks: 1, lastAt: "" }],
      live: true,
    },
    leakage: ONE_LEAKAGE,
  });
  const prose = items
    .map((item) => `${item.headline}. ${item.detail}`)
    .join(" ");

  it("writes no count against a plural noun", () => {
    expect(items.length).toBeGreaterThan(3);
    expect(prose).not.toMatch(BROKEN);
  });

  it("says a single flagged listing carries, never carry", () => {
    const cues = items.find((item) => item.key === "cues");

    expect(cues?.headline).toContain("carries copy that buyer agents flag");
    expect(cues?.detail).not.toContain("across them");
  });

  it("does not call one buyer or one search several", () => {
    const keys = ["stale", "demand", "refunds"];
    const lines = keys.map(
      (key) => items.find((item) => item.key === key)?.headline ?? "",
    );

    expect(lines.join(" ")).not.toMatch(BROKEN);
    expect(lines.join(" ")).toContain("A buyer came back");
  });
});

describe("the standing reasons, when every count is one", () => {
  it("writes no count against a plural noun", () => {
    const prose = reasonsFor(ONE_STANDING)
      .map((reason) => reason.text)
      .join(" ");

    expect(prose).not.toMatch(BROKEN);
  });
});

describe("what the assistant says about a count of one", () => {
  it("counts the shop's problems in a sentence a person would say", async () => {
    const turn = await localTransport.ask(
      "why am I not being picked?",
      await shopContext(),
    );

    expect(turn.said).not.toMatch(BROKEN);
    expect(turn.said).toMatch(/^(One thing is|\d+ things are|Nothing is)/);
  });
});
