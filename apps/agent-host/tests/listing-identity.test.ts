// What a listing *is*, independent of how the shop decorated it, and which
// window a buy errand may open. These cases lived beside the typed pick; the
// pick is gone, the identity rules are not.
import { describe, expect, it } from "vitest";

import { cleanTitle, productKey } from "../src/browser/listing-identity.js";
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

  /** A look is about a category, never about one product: the pick's pin is
   *  let go by the same call that aims the errand at the shop they named. */
  it("lets the tapped product go when the errand is aimed at a shop", () => {
    const pin = new WebPin();
    pin.hold(OFFERED[3]!);
    pin.toShop("Amazon", "INR");

    expect(pin.product).toBeNull();
    expect(pin.allows("https://www.amazon.in/WD-SN3000/dp/B0ZZZZZZZZ")).toBe(
      true,
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
