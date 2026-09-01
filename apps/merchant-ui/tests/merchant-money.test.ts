import { describe, expect, it } from "vitest";

import {
  draftProblem,
  paiseFromRupees,
  rupeesFromPaise,
} from "../src/listings/itemDraft.ts";
import { reasonsFor } from "../src/advisor/standingReasons.ts";
import { fixtureDesk } from "../src/api/merchantFixtures.ts";

const STANDING = fixtureDesk().merchants[0];

describe("rupees in, paise out", () => {
  it("pads the fraction rather than multiplying, so 1299.1 is 129910", () => {
    expect(paiseFromRupees("1299")).toBe(129900);
    expect(paiseFromRupees("1299.1")).toBe(129910);
    expect(paiseFromRupees("1299.99")).toBe(129999);
    expect(paiseFromRupees("1,299.00")).toBe(129900);
  });

  it("refuses anything that is not a plain rupee amount", () => {
    expect(paiseFromRupees("")).toBeNull();
    expect(paiseFromRupees("₹1299")).toBeNull();
    expect(paiseFromRupees("1299.999")).toBeNull();
    expect(paiseFromRupees("-1299")).toBeNull();
  });

  it("round-trips a listed amount back into the edit field", () => {
    expect(rupeesFromPaise(129900)).toBe("1299.00");
    expect(rupeesFromPaise(50)).toBe("0.50");
  });
});

describe("a draft the merchant cannot yet sign", () => {
  it("names the missing name and the unparseable price", () => {
    expect(
      draftProblem({
        name: "",
        description: "",
        productUrl: "",
        imageUrl: "",
        rupees: "10",
        floorRupees: "",
        active: true,
      }),
    ).toContain("name");
    expect(
      draftProblem({
        name: "Kurta",
        description: "",
        productUrl: "",
        imageUrl: "",
        rupees: "ten",
        floorRupees: "",
        active: true,
      }),
    ).toContain("rupees");
  });

  it("is empty once both are answered", () => {
    expect(
      draftProblem({
        name: "Kurta",
        description: "",
        productUrl: "https://kolam-run.example/kurta",
        imageUrl: "",
        rupees: "1299",
        floorRupees: "",
        active: true,
      }),
    ).toBe("");
  });
});

describe("why a buyer agent would or would not pick you", () => {
  it("names the prices that did not match, in a shopkeeper's words", () => {
    const texts = reasonsFor(STANDING!).map((reason) => reason.text);

    expect(texts.join(" ")).toContain("2 of 41 prices you signed");
    expect(texts.join(" ")).toContain("counts for more than anything else");
  });

  it("keeps lost stock races out of the score and says so", () => {
    const race = reasonsFor(STANDING!).find((reason) =>
      reason.text.includes("races for the last one"),
    );

    expect(race?.tone).toBe("aside");
    expect(race?.text).toContain("not bad behaviour");
  });
});
