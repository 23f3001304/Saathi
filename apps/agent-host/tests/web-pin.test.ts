// Told "Amazon", the research errand verified primeabgb and moglix. The shop
// they named is the model's own declaration, and this is where the host turns
// that declaration into hosts it can hold the errand to. Nothing here reads
// the shopper's words: the name arrives already chosen by the model.
import type { BatchRead } from "@covenant/browser-drive";
import { EMPTY_PAGE } from "@covenant/browser-drive";
import { describe, expect, it } from "vitest";

import { CardVerbs } from "../src/browser/web-card.js";
import { WebFindings } from "../src/browser/web-listing.js";
import { WebTrail } from "../src/browser/web-trail.js";
import { VerifiedReads, VerifyVerbs } from "../src/browser/web-verify.js";
import { BeatHub } from "../src/http/beat-hub.js";
import { emptyResult } from "../src/purchase/purchase-result.js";
import { WebLookStep } from "../src/purchase/web-look-step.js";
import { WebPin } from "../src/purchase/web-pin.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

const AMAZON = "https://www.amazon.in/dp/B0CK778YL5";
const MOGLIX = "https://www.moglix.com/adata-xpg-1tb/mp/msn:1";
const OFF_SHOP = "the shopper named amazon.in; this page is moglix.com";

function pinFor(named: string): WebPin {
  const pin = WebPin.forShop(named, "INR");
  if (pin === null) throw new Error(`no pin for ${named}`);
  return pin;
}

/** The one question the shop pin answers, asked by the two research verbs. */
function takes(named: string, url: string): boolean {
  return pinFor(named).offShop(url) === null;
}

describe("the shop they named, resolved to hosts", () => {
  it("holds a name from the table to that market's storefront", () => {
    expect(takes("Amazon", AMAZON)).toBe(true);
    expect(takes("Amazon", MOGLIX)).toBe(false);
    expect(takes("  AMAZON  ", AMAZON)).toBe(true);
    expect(takes("flipkart", "https://www.flipkart.com/p/x")).toBe(true);
    expect(takes("myntra", "https://www.myntra.com/p/x")).toBe(true);
    expect(takes("croma", "https://www.croma.com/p/x")).toBe(true);
    expect(takes("Reliance Digital", "https://reliancedigital.in")).toBe(true);
  });

  it("takes a literal hostname as given", () => {
    expect(takes("amazon.in", AMAZON)).toBe(true);
    expect(takes("www.amazon.in", AMAZON)).toBe(true);
    expect(takes("primeabgb.com", "https://primeabgb.com/x")).toBe(true);
    expect(takes("primeabgb.com", MOGLIX)).toBe(false);
  });

  it("pins nothing on a name it cannot resolve, and nothing on none", () => {
    expect(WebPin.forShop("", "INR")).toBeNull();
    expect(WebPin.forShop("   ", "INR")).toBeNull();
    expect(WebPin.forShop("that shop near the station", "INR")).toBeNull();
    expect(WebPin.forShop("Amazon", "USD")).toBeNull();
  });
});

describe("which hosts are that shop", () => {
  /** A shop runs more than one hostname: `m.amazon.in` is the shop they
   *  named, and `http` is the same page over a worse transport, which is not
   *  this pin's business. What is refused is a DIFFERENT shop. */
  it("takes a subdomain and http, refuses a lookalike and a non-page", () => {
    expect(takes("Amazon", "https://m.amazon.in/dp/B0CK778YL5")).toBe(true);
    expect(takes("Amazon", "http://www.amazon.in/dp/B0")).toBe(true);
    expect(takes("Amazon", "https://notamazon.in/dp/B0")).toBe(false);
    expect(takes("Amazon", "file:///etc/passwd")).toBe(false);
  });

  /** The shop stops at the two research verbs. `allows` is the window's own
   *  question, asked by `web_open` in a BUY errand off the lane's one pin:
   *  gating it here would hold a checkout to the shop a previous look named,
   *  and refuse the hop with a sentence about a product nobody is holding. */
  it("is not a gate on the window: web_open is left to the product", () => {
    expect(pinFor("Amazon").allows(MOGLIX)).toBe(true);
    expect(pinFor("Amazon").allows("https://checkout.example/pay")).toBe(true);
  });
});

describe("what the errand is told about its pin", () => {
  it("refuses an off-shop page in the two hosts it is about", () => {
    expect(pinFor("Amazon").offShop(MOGLIX)).toBe(OFF_SHOP);
    expect(pinFor("Amazon").offShop(AMAZON)).toBeNull();
  });

  it("says the host it is held to, or that the name resolved to nothing", () => {
    const pin = new WebPin();
    pin.toShop("Amazon", "INR");
    expect(pin.shopNote()).toBe("amazon.in");
    pin.toShop("that shop near the station", "INR");
    expect(pin.shopNote()).toBe(
      "none: could not resolve that shop near the station to a host",
    );
    pin.toShop(null, "INR");
    expect(pin.shopNote()).toBeNull();
  });

  it("refuses nothing at all where no shop was named", () => {
    const pin = new WebPin();
    pin.toShop(null, "INR");
    expect(pin.offShop(MOGLIX)).toBeNull();
  });
});

const read: BatchRead = {
  requested: AMAZON,
  url: AMAZON,
  dom: { ...EMPTY_PAGE, url: AMAZON, title: "ADATA XPG", listings: [] },
  declared: [],
  prices: [],
  text: "ADATA XPG ₹7,499",
  soldOut: false,
  failure: null,
};

const asked: string[][] = [];
const reader = {
  readMany: (urls: readonly string[]) => {
    asked.push([...urls]);
    return Promise.resolve([read]);
  },
};

function verifying(pin: WebPin, reads = new VerifiedReads()): VerifyVerbs {
  return new VerifyVerbs(reader, reads, new WebTrail(), null, pin);
}

describe("a pinned research errand reads only the shop they named", () => {
  it("refuses an off-shop URL by name, and never opens it", async () => {
    const reads = new VerifiedReads();
    const result = await verifying(pinFor("Amazon"), reads).verify([
      AMAZON,
      MOGLIX,
    ]);
    expect(asked).toEqual([[AMAZON]]);
    expect(result.body["refused"]).toEqual([
      { url: MOGLIX, reason: "off_shop", because: OFF_SHOP },
    ]);
    expect(reads.find(MOGLIX)).toBeNull();
  });

  it("says so when the name they used resolved to no host at all", async () => {
    const pin = new WebPin();
    pin.toShop("primeabgb", "INR");
    const result = await verifying(pin).verify([AMAZON]);
    expect(result.body["shop_pin"]).toBe(
      "none: could not resolve primeabgb to a host",
    );
  });

  it("refuses a card row off the shop, by name, before anything else", () => {
    const verbs = new CardVerbs(
      new WebFindings(),
      new VerifiedReads(),
      pinFor("Amazon"),
    );
    const result = verbs.card([
      { url: MOGLIX, title: "ADATA XPG", price_text: "₹7,499" },
    ]);
    expect(result.body["carded"]).toEqual([]);
    expect(result.body["refused"]).toEqual([
      { url: MOGLIX, reason: "off_shop", because: OFF_SHOP },
    ]);
  });
});

const spoke = {
  transcript: ["", "Read it."],
  blocked: [],
  turns: 2,
  completed: true,
};

describe("the plan's shop is what pins the errand", () => {
  it("aims the pin at the shop the plan named, for the whole errand", async () => {
    const pin = new WebPin();
    const step = new WebLookStep(
      new BeatHub(new StepClock(), new RecordingLogger()),
      { converse: () => Promise.resolve(spoke) },
      new WebTrail(),
      new WebFindings(),
      new RecordingLogger(),
      "INR",
      undefined,
      null,
      pin,
    );
    await step.look(emptyResult("r1", "1tb ssd on amazon"), {
      action: "look_on_web",
      reply: "",
      question: null,
      query: "1tb ssd",
      shop: "Amazon",
    });
    expect(pin.shopNote()).toBe("amazon.in");
    expect(pin.offShop(MOGLIX)).toBe(OFF_SHOP);
  });
});
