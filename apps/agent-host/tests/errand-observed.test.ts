// What this host watched an errand do, written down for the model to say. Every
// fact prints, present or absent: "nothing was put in a basket" is a thing the
// shopper should hear, and a block that fell silent on it would leave the
// model to guess.
import { describe, expect, it } from "vitest";

import {
  emptyFacts,
  factsFrom,
  OBSERVED_MARK,
  observedBlock,
  shopOf,
  windowOwnerOf,
} from "../src/purchase/observed-block.js";

const FULL = emptyFacts({
  pages: [
    "https://www.amazon.in/s?k=ssd",
    "https://www.amazon.in/Crucial-X9/dp/B0CK778YL5",
    "https://www.flipkart.com/crucial-x9/p/itm1",
  ],
  cards: 3,
  carted: true,
  basketHolds: "Crucial X9 1TB",
  window: "agent",
  filled: ["name", "city"],
  signedIn: true,
  asksCode: true,
});

function lines(text: string): readonly string[] {
  return text.split("\n").filter((line) => line.startsWith("- "));
}

describe("the block's shape", () => {
  it("opens with the data marker and closes on a blank line", () => {
    const block = observedBlock(FULL);
    expect(block.startsWith(`${OBSERVED_MARK}\n- `)).toBe(true);
    expect(block.endsWith("\n\n")).toBe(true);
  });

  it("says one thing per fact, seven facts, in a fixed order", () => {
    expect(lines(observedBlock(FULL)).map((line) => line.split(":")[0])).toEqual([
      "- pages opened",
      "- cards now on their screen",
      "- basket",
      "- window",
      "- clock",
      "- delivery form",
      "- sign-in",
    ]);
  });
});

describe("a full errand", () => {
  const block = observedBlock(FULL);

  it("counts the pages and names the shops, never a path", () => {
    expect(block).toContain("- pages opened: 3 (amazon.in, flipkart.com)");
    expect(block).not.toContain("/dp/");
    expect(block).not.toContain("?k=");
  });

  it("names the basket, the window, the form and the sign-in", () => {
    expect(block).toContain("- cards now on their screen: 3");
    expect(block).toContain('- basket: the shop\'s basket holds "Crucial X9 1TB"');
    expect(block).toContain("- window: still the agent's, on the page last read");
    expect(block).toContain("- clock: this errand finished within its time");
    expect(block).toContain("- delivery form: filled (name, city)");
    expect(block).toContain(
      "- sign-in: signed in from the stored sign-in; the shop now asks for a one-time code only they have",
    );
  });
});

describe("an errand that did nothing", () => {
  const block = observedBlock(emptyFacts());

  it("says so, fact by fact, rather than falling silent", () => {
    expect(block).toContain("- pages opened: none");
    expect(block).toContain("- cards now on their screen: none from this errand");
    expect(block).toContain("- basket: nothing was put in a basket");
    expect(block).toContain("- window: no window is open");
    expect(block).toContain("- delivery form: nothing was filled");
    expect(block).toContain("- sign-in: this host did not sign in");
  });
});

describe("how an errand ended", () => {
  it("names the clock when it ran out", () => {
    expect(observedBlock(emptyFacts({ expired: true }))).toContain(
      "- clock: this errand ran out of time before it finished",
    );
  });

  it("names the break without guessing at its cause", () => {
    expect(
      observedBlock(emptyFacts({ failure: "Execution context was destroyed" })),
    ).toContain("- clock: this errand stopped early before it finished");
  });

  it("names a handover and whose the window is", () => {
    expect(observedBlock(emptyFacts({ handedOver: "payment" }))).toContain(
      "- window: handed to them because payment",
    );
    expect(observedBlock(emptyFacts({ window: "shopper" }))).toContain(
      "- window: the shopper has the wheel; the shop is waiting on them",
    );
  });

  it("says the item went in even when its name is unknown", () => {
    expect(observedBlock(emptyFacts({ carted: true }))).toContain(
      "- basket: this host put the item in the shop's basket",
    );
  });
});

describe("reading the facts off the host's own record", () => {
  it("maps the window state to who holds it", () => {
    expect(windowOwnerOf("agent-drive")).toBe("agent");
    expect(windowOwnerOf("user-drive")).toBe("shopper");
    expect(windowOwnerOf("idle")).toBe("none");
    expect(windowOwnerOf(null)).toBe("none");
  });

  it("takes the progress record as read, and the overrides on top", () => {
    const facts = factsFrom(
      {
        carted: true,
        handedOver: "login",
        filled: ["city"],
        signedIn: false,
        awaitsCode: false,
      },
      { pages: ["https://shop.example/x"], window: "shopper" },
    );
    expect(facts).toMatchObject({
      carted: true,
      handedOver: "login",
      filled: ["city"],
      pages: ["https://shop.example/x"],
      window: "shopper",
      cards: 0,
    });
  });

  it("stands on an empty record when there is none", () => {
    expect(factsFrom(null, { cards: 2 })).toEqual(emptyFacts({ cards: 2 }));
  });

  it("names a shop by its host, and a path-only name when that fails", () => {
    expect(shopOf("https://www.amazon.in/s?k=ssd")).toBe("amazon.in");
    expect(shopOf("not a url")).toBe("not a url");
  });
});
