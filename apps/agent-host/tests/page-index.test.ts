import { describe, expect, it } from "vitest";

import {
  forgetfulPageIndex,
  openPageIndex,
  subjectKey,
} from "../src/purchase/page-index.js";
import { SilentLogger } from "./support/fakes.js";

class StepClock {
  constructor(private ms = 1_700_000_000_000) {}
  now(): Date {
    return new Date(this.ms);
  }
  advance(by: number): void {
    this.ms += by;
  }
}

function indexIn(clock: StepClock) {
  // ":memory:" keeps the suite off the real ledger file.
  return openPageIndex(":memory:", clock, new SilentLogger());
}

const PAGES = [
  { url: "https://a.in/nvme", title: "Lexar NM790 2TB", merchant: "a.in" },
  { url: "https://b.in/nvme", title: "Crucial P2 2TB", merchant: "b.in" },
];

describe("the pages this host has already opened", () => {
  it("hands back what an earlier errand carded", () => {
    const index = indexIn(new StepClock());
    index.remember("2 TB NVMe SSD", PAGES);
    expect(index.recall("2 TB NVMe SSD", 6).map((p) => p.url)).toEqual([
      "https://a.in/nvme",
      "https://b.in/nvme",
    ]);
    index.close();
  });

  /** One shopper's find is the next shopper's starting point: nothing stored
   *  here belongs to a conversation, which is what makes that safe. */
  it("finds the same shelf however the words were ordered", () => {
    const index = indexIn(new StepClock());
    index.remember("2 TB NVMe SSD", PAGES);
    expect(index.recall("ssd nvme 2 tb", 6)).toHaveLength(2);
    index.close();
  });

  it("does not confuse one shelf for another", () => {
    const index = indexIn(new StepClock());
    index.remember("2 TB NVMe SSD", PAGES);
    expect(index.recall("navy cotton kurta", 6)).toEqual([]);
    index.close();
  });

});

describe("what the index refuses to remember", () => {
  it("stores no price, because a price is a claim from one day", () => {
    const index = indexIn(new StepClock());
    index.remember("ssd", PAGES);
    const held = index.recall("ssd", 6)[0];
    expect(held).toBeDefined();
    expect(Object.keys(held ?? {}).sort()).toEqual([
      "merchant",
      "title",
      "url",
    ]);
    index.close();
  });

  it("keeps one row per url, refreshed rather than duplicated", () => {
    const index = indexIn(new StepClock());
    index.remember("ssd", PAGES);
    index.remember("ssd", [{ ...PAGES[0]!, title: "Lexar NM790 2TB Gen4" }]);
    const held = index.recall("ssd", 6);
    expect(held).toHaveLength(2);
    expect(held[0]?.title).toBe("Lexar NM790 2TB Gen4");
    index.close();
  });
});

describe("a page nobody has confirmed lately", () => {
  it("drops out rather than sending an errand at a dead shop", () => {
    const clock = new StepClock();
    const index = indexIn(clock);
    index.remember("ssd", PAGES);
    clock.advance(15 * 24 * 60 * 60 * 1000);
    expect(index.recall("ssd", 6)).toEqual([]);
    index.close();
  });
});

describe("the subject a page is filed under", () => {
  it("is the same for the same shelf said differently", () => {
    expect(subjectKey("2 TB NVMe SSD")).toBe(subjectKey("ssd  nvme   2 TB"));
  });

  it("drops the noise that carries no meaning", () => {
    expect(subjectKey("a 2 TB SSD!")).toBe(subjectKey("2 TB SSD"));
  });

  it("is empty for a subject that says nothing", () => {
    expect(subjectKey("   ")).toBe("");
    expect(subjectKey("a")).toBe("");
  });
});

describe("a host that cannot reach its database", () => {
  it("searches instead of failing", () => {
    const index = forgetfulPageIndex();
    index.remember("ssd", PAGES);
    expect(index.recall("ssd", 6)).toEqual([]);
    index.close();
  });
});
