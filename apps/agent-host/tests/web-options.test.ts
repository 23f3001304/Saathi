// What an open-web errand hands back. It used to be a paragraph — "PNY CS900
// 250GB … ₹4,756.10 … [link]" — beside a catalog path that has rendered
// picture cards since the first demo. Same act, same beat, same cards; the one
// difference is the line under the price, and it is the true one.
import type { TurnPlan } from "@covenant/agents";
import { beforeEach, describe, expect, it } from "vitest";

import type { OptionRowData } from "../src/http/chat-beat.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { WebLookStep } from "../src/purchase/web-look-step.js";
import {
  PRODUCT,
  PRODUCT_BLUE,
  RESULTS,
  RESULTS_AGAIN,
} from "./support/fake-shop.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";
import { webHarness } from "./support/web-harness.js";
import type { WebHarness } from "./support/web-harness.js";

const PLAN: TurnPlan = {
  action: "look_on_web",
  reply: "Looking now.",
  question: null,
  query: "runners",
  amendment: null,
  traits: [],
};

let web: WebHarness;
let hub: BeatHub;

/**
 * An errand that walks the real tools, so the cards come off a real read. It
 * reads the same page twice, as a live errand does when it comes back to the
 * results after looking at one of them.
 */
function walking(): { converse: () => Promise<never | object> } {
  return {
    converse: async () => {
      await web.call("web_open", { url: RESULTS });
      await web.call("web_read");
      await web.call("web_open", { url: RESULTS_AGAIN });
      await web.call("web_read");
      return {
        transcript: ["Three pairs on the results page."],
        blocked: [],
        turns: 2,
        completed: true,
      };
    },
  };
}

async function offered(): Promise<readonly OptionRowData[]> {
  const step = new WebLookStep(
    hub,
    walking(),
    web.trail,
    web.findings,
    new RecordingLogger(),
    "INR",
  );
  await step.look(emptyResult("r1", "runners"), PLAN);
  const beat = hub.snapshot().find((entry) => entry.kind === "options");
  return beat?.kind === "options" ? beat.options : [];
}

beforeEach(() => {
  web = webHarness();
  hub = new BeatHub(new StepClock(), new RecordingLogger());
});

describe("what the window read becomes", () => {
  it("hands the model the same tiles the shopper is about to be shown", async () => {
    await web.call("web_open", { url: RESULTS });
    const body = await web.body("web_read");
    const page = body["page"] as {
      listings: { ref: string; title: string; url: string }[];
    };
    expect(page.listings.map((listing) => listing.title)).toContain(
      "Red Runners",
    );
    expect(page.listings[0]?.url).toBe(PRODUCT);
    expect(page.listings[0]?.ref).toMatch(/^w[0-9]+$/);
  });

  it("offers them as an options beat rather than as a paragraph", async () => {
    const options = await offered();
    // Equal word overlap on "runners", so the cheaper card leads — the order
    // `rankCatalog` puts the shelf in, applied to what a page printed.
    expect(options.map((option) => option.title)).toEqual([
      "Trail Runners",
      "Red Runners",
      "Blue Runners",
    ]);
    // Red Runners was on both reads under two tracking URLs; it is one thing
    // the shopper can be offered, and it takes one of the four places.
    expect(options).toHaveLength(3);
    expect(options[1]?.pricePaise).toBe(249_900);
    expect(options[2]?.sourceUrl).toBe(PRODUCT_BLUE);
    expect(options[0]?.merchant).toBe("shop.example");
  });
});

/**
 * The invariant `web-invariants.test.ts` states for a reading, restated for the
 * card built from it. A page price is P0 either way; what changed is that it is
 * now on a picture card, which is exactly where a shopper could mistake it for
 * something somebody stood behind.
 */
describe("a card built from a page says so on its face", () => {
  it("never claims a signed quote, and names the page it was read off", async () => {
    const options = await offered();
    expect(options.every((option) => option.quoteSigned === false)).toBe(true);
    expect(
      options.every((option) => (option.sourceUrl ?? "").startsWith("https:")),
    ).toBe(true);
  });

  it("drops a tile whose price is not this covenant's currency", async () => {
    const options = await offered();
    // "20% off" is not a price, and a card states a number under a picture —
    // this tile matches the query as well as any of them and still drops.
    expect(options.some((option) => option.title.includes("Sock"))).toBe(false);
  });

  it("carries only an https picture, and no field at all where there is none", async () => {
    const options = await offered();
    const by = (title: string): OptionRowData | undefined =>
      options.find((option) => option.title === title);
    expect(by("Red Runners")?.imageUrl).toBe(
      "https://img.shop.example/red.jpg",
    );
    // No picture on the page, and none invented for the card.
    expect(Object.hasOwn(by("Blue Runners") ?? {}, "imageUrl")).toBe(false);
    // The trail tile's picture is served over http; the card falls back to its
    // woven plate rather than asking a browser for blocked mixed content.
    expect(Object.hasOwn(by("Trail Runners") ?? {}, "imageUrl")).toBe(false);
  });
});

/**
 * The failure this rule was written from: a live errand searched Amazon for an
 * SSD, bounced back to the storefront, and offered its promo rail — "Starting
 * ₹99", "Wireless" — because that page happened to carry the most tiles.
 */
describe("only tiles that answer the question", () => {
  it("drops what the window was shown but nobody asked for", async () => {
    const step = new WebLookStep(
      hub,
      walking(),
      web.trail,
      web.findings,
      new RecordingLogger(),
      "INR",
    );
    await step.look(emptyResult("r3", "ssd"), { ...PLAN, query: "1TB SSD" });
    expect(hub.snapshot().some((beat) => beat.kind === "options")).toBe(false);
  });
});

describe("what the harness promises under the cards", () => {
  it("points at the cards only on a turn that has some", async () => {
    await offered();
    const closing = hub
      .snapshot()
      .flatMap((beat) => (beat.kind === "message" ? [beat.text] : []))
      .at(-1);
    // It says what the cards are and stops. The instruction to tap one lives
    // at the composer, which is the only place a shopper can act on it, and
    // saying it here as well put the same sentence on screen twice.
    expect(closing).toContain("basket");
    expect(closing).not.toContain("Tap one");
  });
});

describe("nothing is offered that was not read", () => {
  it("shows no cards on a turn that opened no page", async () => {
    const step = new WebLookStep(
      hub,
      { converse: () => Promise.reject(new Error("no window")) },
      web.trail,
      web.findings,
      new RecordingLogger(),
      "INR",
    );
    await step.look(emptyResult("r2", "runners"), PLAN);
    expect(hub.snapshot().some((beat) => beat.kind === "options")).toBe(false);
  });
});
