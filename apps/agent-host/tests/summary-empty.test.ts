import { describe, expect, it } from "vitest";

import { summariseFor } from "../src/purchase/web-summary.js";

const ASKED = ["Buy me an SSD from Amazon", "2 TB, Internal, Up to ₹40,000"];
const FOUND = [
  {
    ref: "w1",
    title: "Lexar NM790 2TB",
    price_text: "₹9,999",
    price_paise: 999900,
    url: "https://a.in/x",
    image_url: null,
  },
];

/**
 * Live, with three Amazon pages read and nothing carded, the agent wrote "I
 * found 2 TB internal SSD options on Amazon within your ₹40,000 limit. Review
 * the option you prefer" over an empty screen.
 *
 * The instruction not to was already there, underneath one that presupposed
 * there were candidates: "write which of these you would buy and why". Two
 * instructions, and the earlier, longer one won - the same shape as the
 * language picker losing to the match-the-line rule.
 */
describe("the summary when the errand carded nothing", () => {
  const empty = summariseFor(ASKED, null, []);

  it("does not ask which of them the model would buy", () => {
    expect(empty).not.toMatch(/which of these you would buy/i);
  });

  it("tells it plainly that it found nothing", () => {
    expect(empty).toMatch(/found nothing|did not find/i);
  });

  it("forbids naming a product or a price it does not have", () => {
    expect(empty).toMatch(/name no product|do not name a product/i);
  });

  /** The cards are the screen's, and there are none: a reply that sends them
   *  to "the option you prefer" is pointing at nothing. */
  it("does not send them to cards that are not there", () => {
    expect(empty).not.toMatch(/their cards are already on screen/i);
  });
});

describe("the summary when it did find something", () => {
  const full = summariseFor(ASKED, null, FOUND);

  it("still asks for the verdict", () => {
    expect(full).toMatch(/which of these you would buy/i);
  });

  it("still says the cards are already on screen", () => {
    expect(full).toMatch(/cards/i);
    expect(full).toContain("Lexar NM790 2TB");
  });
});
