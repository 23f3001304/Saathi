// Tapping a card and typing its name are the same act. A live run found and
// carded specific drives, the shopper typed "go with crucial E100", and the
// turn went to the planner, came back `browse`, said this shop stocks nothing,
// and opened a fresh errand that wandered onto Amazon's home page.
import { describe, expect, it } from "vitest";

import { cleanTitle, productKey } from "../src/browser/listing-identity.js";
import { distilQuery } from "../src/purchase/query-distil.js";
import { typedPick } from "../src/purchase/typed-pick.js";
import { WebOffered } from "../src/purchase/web-offered.js";
import { WebPin } from "../src/purchase/web-pin.js";

function card(ref: string, title: string, dp = ref): {
  ref: string;
  title: string;
  price_text: string;
  price_paise: number;
  url: string;
  image_url: null;
} {
  return {
    ref,
    title,
    price_text: "₹15,999",
    price_paise: 1_599_900,
    url: `https://www.amazon.in/x/dp/B0${dp}00000`,
    image_url: null,
  };
}

const OFFERED = [
  card("w1", "Crucial E100 1TB Portable SSD"),
  card("w2", "Crucial X9 1TB Portable SSD"),
  card("w3", "SANDISK Extreme 1TB Portable SSD"),
  card("w4", "ADATA XPG GAMMIX S70 1TB SSD"),
];

describe("naming a card in words is choosing it", () => {
  it("routes the one they named", () => {
    expect(typedPick("go with crucial E100", OFFERED)).toEqual({
      ref: "w1",
      between: [],
    });
  });

  it("asks when their words fit more than one", () => {
    const named = typedPick("the crucial one", OFFERED);

    expect(named?.ref).toBeNull();
    expect(named?.between.map((row) => row.ref)).toEqual(["w1", "w2"]);
  });
});

describe("a sentence that names no card belongs to the planner", () => {
  it("ignores a word every card carries", () => {
    // "SSD" is in all four, so it discriminates nothing and this is a fresh
    // request, not a pick.
    expect(typedPick("get me another SSD", OFFERED)).toBeNull();
  });

  it("ignores a bare agreement", () => {
    expect(typedPick("yes", OFFERED)).toBeNull();
    expect(typedPick("go ahead", OFFERED)).toBeNull();
  });

  it("does nothing until there is a set on the table", () => {
    expect(typedPick("crucial E100", [])).toBeNull();
  });
});

describe("a buy errand cannot open a different product", () => {
  it("refuses another product and allows the shop's own search", () => {
    // A pick of an ADATA failed to open, and the errand searched Amazon and
    // opened a Western Digital product page instead.
    const pin = new WebPin();
    pin.hold(OFFERED[3]!);

    expect(pin.allows(OFFERED[3]!.url)).toBe(true);
    expect(pin.allows("https://www.amazon.in/s?k=adata+xpg")).toBe(true);
    expect(pin.allows("https://www.amazon.in/WD-SN3000/dp/B0ZZZZZZZZ")).toBe(
      false,
    );
  });

  it("holds nothing once released", () => {
    const pin = new WebPin();
    pin.hold(OFFERED[0]!);
    pin.release();

    expect(pin.allows("https://www.amazon.in/WD-SN3000/dp/B0ZZZZZZZZ")).toBe(
      true,
    );
  });
});

describe("what a shop is actually asked for", () => {
  it("drops the turn-taking and keeps every line that states a want", () => {
    expect(
      distilQuery("Buy me a SSD\n1 TB internal\nFOR LAPTOP 20,000RS MAX\nOK"),
    ).toBe("Buy me a SSD 1 TB internal FOR LAPTOP 20,000RS MAX");
  });

  it("keeps the whole thing rather than nothing", () => {
    expect(distilQuery("ok\nyes")).toBe("ok\nyes");
  });
});

describe("a title is a name plus the shop's decoration", () => {
  it("takes the decoration off", () => {
    expect(cleanTitle("Deal Price ₹619 M.R.P.: ₹1,299 58% off Floral Dress")).toBe(
      "Floral Dress",
    );
  });

  it("identifies one product across the pages that showed it", () => {
    expect(productKey("https://www.amazon.in/CRUCIAL-X9/dp/B0CK778YL5/ref=x")).toBe(
      "B0CK778YL5",
    );
    expect(productKey("https://www.amazon.in/s?k=ssd")).toBeNull();
  });
});

describe("cards belong to the conversation that was shown them", () => {
  it("answers a different chat with nothing", () => {
    // The same cross-conversation leak the errand session had: one chat's
    // findings must not answer another chat's sentence.
    const offered = new WebOffered();
    offered.claim("cnv_ssd");
    offered.offer(OFFERED);

    expect(offered.live("cnv_ssd").map((row) => row.ref)).toEqual([
      "w1",
      "w2",
      "w3",
      "w4",
    ]);
    expect(offered.live("cnv_kurta")).toEqual([]);
    expect(offered.live(null)).toEqual([]);
  });
});
