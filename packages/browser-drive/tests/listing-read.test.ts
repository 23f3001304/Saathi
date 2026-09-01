// Reading listings off a page, in real Chrome, against two fixture shops built
// differently on purpose: one that publishes what it sells the way the web says
// to, and one that publishes nothing at all. Same reader, both shops — which is
// the whole claim. Nothing here is tuned to any storefront.
import { beforeAll, afterAll, describe, expect, it } from "vitest";

import { challengeIn } from "../src/read/challenge.js";
import { paymentPageIn, signInPageIn } from "../src/read/window-step.js";
import type { PageListing } from "../src/read/page-dom.js";
import type { BrowserSession } from "../src/session/browser-session.js";
import { buildSession, LAUNCH_MS, probeChrome } from "./chrome-session.js";
import { fixtureUrl } from "./fakes.js";

const SKIP = await probeChrome("listing-read");
if (SKIP !== null) {
  console.warn(`[browser-drive] listing-read suite SKIPPED: ${SKIP}`);
}

let session: BrowserSession;

beforeAll(async () => {
  if (SKIP !== null) return;
  session = buildSession("chrome_listings");
  await session.launch();
}, LAUNCH_MS);

afterAll(async () => {
  if (SKIP !== null) return;
  await session.close();
}, LAUNCH_MS);

async function listingsOn(page: string): Promise<readonly PageListing[]> {
  await session.page().navigate(fixtureUrl(page));
  const dom = await session.page().readPage();
  return dom.listings;
}

function named(
  listings: readonly PageListing[],
  title: string,
): PageListing | undefined {
  return listings.find((listing) => listing.title === title);
}

const chrome = describe.skipIf(SKIP !== null);

chrome("a shop that declares what it sells", () => {
  it("reads schema.org/Product out of a JSON-LD graph, list and all", async () => {
    const listings = await listingsOn("declared.html");
    const found = named(listings, "Ridgeline Trail 2");
    expect(found?.priceText).toBe("₹ 4299.00");
    expect(found?.href).toBe("https://bazaar.example/ridgeline-trail-2");
    expect(found?.imageUrl).toBe("https://img.bazaar.example/ridgeline.jpg");
  });

  it("reads the same vocabulary as microdata", async () => {
    const listings = await listingsOn("declared.html");
    const found = named(listings, "Marsh Walker");
    expect(found?.priceText).toBe("₹ 1899.00");
    expect(found?.href).toBe("https://bazaar.example/marsh-walker");
    expect(found?.imageUrl).toBe("https://img.bazaar.example/marsh.jpg");
  });

  it("reads OpenGraph where the page says it is one product", async () => {
    const listings = await listingsOn("declared.html");
    const found = named(listings, "Trailfoot Runner");
    expect(found?.priceText).toBe("₹ 3499.00");
    expect(found?.href).toBe("https://bazaar.example/trailfoot");
  });

  /** The declared picture is a claim like the price, and gets the same check. */
  it("drops a declared picture that is not https", async () => {
    const listings = await listingsOn("declared.html");
    expect(named(listings, "Kolam Road 5")?.priceText).toBe("₹ 2599.00");
    expect(named(listings, "Kolam Road 5")?.imageUrl).toBeNull();
  });
});

chrome("a shop that declares nothing", () => {
  it("still reads its rows, out of their structure alone", async () => {
    const listings = await listingsOn("plain.html");
    const found = named(listings, "Dune Runner");
    expect(found?.priceText).toBe("₹2,799.00");
    expect(found?.href.endsWith("product.html")).toBe(true);
    expect(found?.imageUrl).toBe("https://img.bazaar.example/dune.jpg");
  });

  /**
   * The degradation, stated: no picture rather than a picture fetched over a
   * scheme a browser would block. The row survives; only the claim it could not
   * support is dropped.
   */
  it("ships the row without a picture rather than shipping a bad one", async () => {
    const listings = await listingsOn("plain.html");
    const found = named(listings, "Salt Flat Racer");
    expect(found?.priceText).toBe("₹5,150.00");
    expect(found?.imageUrl).toBeNull();
  });

  it("is not a listing at all where the page printed no price", async () => {
    const listings = await listingsOn("plain.html");
    // "20% off" is a discount, not a price, and a row with no price is not a
    // row this reader can describe. It is left off rather than shown at zero.
    expect(named(listings, "Cushioned socks")).toBeUndefined();
  });
});

/**
 * A bot check, recognised without being touched. The agent has never been able
 * to interact with one — a challenge is a third-party document, and `RelayGate`
 * refuses an opaque target because "an unreadable target cannot be protected".
 * What is read here is only where the widget came from.
 */
chrome("a shop asking to check you are human", () => {
  it("reads where the widget came from, never what is inside it", async () => {
    await session.page().navigate(fixtureUrl("checkpoint.html"));
    const dom = await session.page().readPage();
    expect(dom.frames).toHaveLength(1);
    expect(dom.frames[0]).toContain("challenges.cloudflare.com");
    expect(challengeIn(dom)).toEqual({
      signal: "challenge_widget",
      detail: "challenges.cloudflare.com",
    });
  });

  it("sees nothing to sight on an ordinary shop page", async () => {
    await session.page().navigate(fixtureUrl("plain.html"));
    expect(challengeIn(await session.page().readPage())).toBeNull();
  });
});

/**
 * The two steps a checkout puts between a basket and a payment page, told apart
 * by what is on them. Nothing here reads a URL for the difference: the delivery
 * step has ordinary boxes and a button that moves the wizard, the payment step
 * asks for a card.
 */
chrome("the steps of a real checkout", () => {
  it("reads a delivery step as somewhere the agent may still act", async () => {
    await session.page().navigate(fixtureUrl("delivery.html"));
    const dom = await session.page().readPage();
    expect(paymentPageIn(dom)).toBeNull();
    expect(signInPageIn(dom)).toBeNull();
    const deliver = dom.controls.find(
      (c) => c.text === "Deliver to this address",
    );
    expect(deliver).toBeDefined();
  });

  it("reads the payment step as the end of the agent's road", async () => {
    await session.page().navigate(fixtureUrl("checkout.html"));
    const dom = await session.page().readPage();
    expect(paymentPageIn(dom)?.signal).toBe("payment_field");
  });

  it("reads a sign-in page as a door only the shopper can open", async () => {
    await session.page().navigate(fixtureUrl("login.html"));
    expect(signInPageIn(await session.page().readPage())).not.toBeNull();
  });
});
