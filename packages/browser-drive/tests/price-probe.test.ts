// The money strings a page printed, read off a real document the way a person
// reads them: the biggest first, each with the words it sits among, and never
// a was-price the shop struck through. The page below is written here rather
// than fetched, so nothing in the probe is tuned to any storefront.
import type { Browser, Page } from "puppeteer";
import { launch } from "puppeteer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PriceCandidate } from "../src/chrome/price-probe.js";
import { priceProbe } from "../src/chrome/price-probe.js";

const LAUNCH_MS = 60_000;

const SHOP = `
<style>
  .price { font-size: 28px }
  .was { font-size: 22px }
  .chrome { font-size: 11px }
</style>
<div class="tile">
  <h2>Navy Kurta</h2>
  <span class="price">₹1,299.00</span>
  <del><span class="was">₹2,499.00</span></del>
  <button>Add to cart</button>
</div>
<div class="chrome"><span>Cart 0 item(s)</span> <span>₹0.00</span></div>
<div class="chrome"><span>Under Rs. 700/month</span></div>
`;

/** Ten distinct prices, all the same size, to prove the cap. */
const MANY = Array.from(
  { length: 10 },
  (_unused, at) => `<div><span>₹${at + 1}00.00</span></div>`,
).join("");

let browser: Browser | null = null;
let skip: string | null = null;

beforeAll(async () => {
  try {
    browser = await launch({ headless: true, args: ["--disable-gpu"] });
  } catch (error) {
    skip = String(error).slice(0, 300);
    console.warn(`[browser-drive] price-probe suite SKIPPED: ${skip}`);
  }
}, LAUNCH_MS);

afterAll(async () => {
  await browser?.close().catch(() => undefined);
});

async function pricesOn(html: string): Promise<readonly PriceCandidate[]> {
  const held = browser;
  if (held === null) throw new Error("no browser");
  let page: Page | null = null;
  try {
    page = await held.newPage();
    await page.setContent(html);
    return await page.evaluate(priceProbe);
  } finally {
    await page?.close().catch(() => undefined);
  }
}

const chrome = describe.skipIf(skip !== null);

chrome("what a page printed, as money strings", () => {
  it("returns the biggest money strings first, with the words around them", async () => {
    const prices = await pricesOn(SHOP);
    expect(prices.map((price) => price.text)).toEqual(["₹1,299.00", "₹0.00"]);
    expect(prices[0]?.around).toContain("Navy Kurta");
    expect(prices[0]?.around).toContain("Add to cart");
  });

  it("never offers a struck-through was-price as a money string", async () => {
    const prices = await pricesOn(SHOP);
    expect(prices.map((price) => price.text)).not.toContain("₹2,499.00");
  });

  it("ignores a number that is not a whole money string on its own", async () => {
    const prices = await pricesOn(SHOP);
    expect(prices.some((price) => price.text.includes("700"))).toBe(false);
  });

  it("hands back eight candidates at most, not a page dump", async () => {
    const prices = await pricesOn(MANY);
    expect(prices).toHaveLength(8);
  });

  it("finds nothing on a page that prints no money at all", async () => {
    const prices = await pricesOn("<p>Nothing for sale here.</p>");
    expect(prices).toEqual([]);
  });
});
