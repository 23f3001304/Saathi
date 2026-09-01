import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  draftOf,
  draftProblem,
  floorPaiseOf,
} from "../src/listings/itemDraft.ts";
import type { MerchantItemView } from "../src/api/merchantTypes.ts";
import { enterDesk } from "./enterDesk.tsx";
import { STUB_ITEM_ID } from "./gatewayStub.ts";

const STOLE: MerchantItemView = {
  itemId: STUB_ITEM_ID,
  name: "Nilgiri handloom stole",
  description: "Handwoven.",
  amountPaise: 189900,
  currency: "INR",
  active: true,
  floorPaise: 170000,
  floorListPaise: 189900,
};

function draft(floorRupees: string, rupees = "1899") {
  return { ...draftOf(STOLE), rupees, floorRupees };
}

describe("a floor is set, never inferred", () => {
  it("loads the band the merchant signed back into the editor", () => {
    expect(draftOf(STOLE).floorRupees).toBe("1700.00");
  });

  it("reads a listing with no band as no discount authority, not as zero", () => {
    expect(draftOf({ ...STOLE, floorPaise: null }).floorRupees).toBe("");
    expect(floorPaiseOf(draft(""))).toBeNull();
  });

  it("refuses a floor above the merchant's own listed price", () => {
    expect(draftProblem(draft("2000"))).toContain(
      "above your own listed price",
    );
  });

  it("refuses a floor that is not a rupee amount", () => {
    expect(draftProblem(draft("seventeen"))).toContain("rupees");
  });

  it("accepts a floor at the listed price — a band of nothing is still a band", () => {
    expect(draftProblem(draft("1899"))).toBe("");
  });
});

describe("the editor says what the floor authorises, in the shopkeeper's words", () => {
  it("names the amount an agent may settle at without asking", async () => {
    await enterDesk("Listings");

    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[0]!);

    expect(
      await screen.findByText(/may settle as low as .* without asking you/i),
    ).toBeTruthy();
  });

  it("says plainly when a listing carries no discount authority", async () => {
    await enterDesk("Listings");

    fireEvent.click(screen.getAllByRole("button", { name: "Open" })[1]!);

    expect(
      await screen.findByText(/Blank means no discount authority/i),
    ).toBeTruthy();
  });

  it("never manufactures urgency around the band", async () => {
    await enterDesk("Listings");

    const body = document.body.textContent ?? "";

    expect(body).not.toMatch(/expires in|hurry|last chance|act now/i);
  });
});

describe("what the floor won", () => {
  it("counts the carts that settled below list, and that all cleared the floor", async () => {
    await enterDesk("Listings");

    expect(
      await screen.findByText(
        /4 carts settled below list this week; all cleared your floor\./,
      ),
    ).toBeTruthy();
  });

  it("shows the band on the row it belongs to, and its absence on the other", async () => {
    await enterDesk("Listings");

    expect(await screen.findByText(/floor ₹1,700/)).toBeTruthy();
    expect(screen.getByText("no floor set")).toBeTruthy();
  });
});
