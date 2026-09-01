import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { enterDesk } from "./enterDesk.tsx";
import { pathOf } from "../src/router/useRoute.ts";

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState(null, "", "/");
});

describe("the shopkeeper's console", () => {
  it("puts the conversation at the root and gives each page its own URL", () => {
    expect(pathOf({ name: "chat" })).toBe("/");
    expect(pathOf({ name: "listings" })).toBe("/listings");
    expect(pathOf({ name: "orders" })).toBe("/orders");
    expect(pathOf({ name: "standing" })).toBe("/standing");
    expect(pathOf({ name: "listing", itemId: "item_x" })).toBe(
      "/listings/item_x",
    );
  });

  it("moves between pages by history, so back works", async () => {
    await enterDesk("Orders");
    expect(window.location.pathname).toBe("/orders");

    fireEvent.click(screen.getByRole("button", { name: "Listings" }));
    expect(window.location.pathname).toBe("/listings");
  });

  it("labels each page live or fixture on the page itself", async () => {
    await enterDesk("Standing");

    expect(await screen.findByText("LIVE")).toBeInTheDocument();
  });

  it("carries none of the shopper's controls — it can spend nothing", async () => {
    await enterDesk();

    expect(
      screen.queryByRole("button", {
        name: /^(buy|buy now|checkout|pay|pay now|place order)$/i,
      }),
    ).toBeNull();
    expect(document.body.innerHTML.toLowerCase()).not.toContain("add to cart");
  });

  it("shows no schema nouns on the surface a shopkeeper works on", async () => {
    await enterDesk();
    const html = document.body.innerHTML;

    for (const noun of [
      "merchant_trust",
      "catalog.read",
      "verdict.emitted",
      "pending_cooloff",
      "SIGNER_UNKNOWN",
      "detectAcross",
    ]) {
      expect(html).not.toContain(noun);
    }
  });

  it("keeps inventory read-only until this device holds a signing key", async () => {
    await enterDesk();

    expect(screen.getByText("read only")).toBeInTheDocument();
  });

  it("asks for the key as a file, once, and never as pasted text", async () => {
    // The settings entry now says what it is beside who you are.
    await enterDesk("Demo shopkeeper · Settings");

    expect(
      await screen.findByRole("button", { name: /Choose your key file/i }),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/paste/i)).toBeNull();
    expect(document.querySelector("textarea")).toBeNull();
  });
});
