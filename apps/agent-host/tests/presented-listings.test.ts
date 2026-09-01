import { describe, expect, it } from "vitest";

import { requestedListings } from "../src/purchase/run-narrator.js";

const KURTA = {
  sku: "item_kurta",
  label: "Navy cotton kurta, M",
  category: "apparel",
  merchant_id: "m",
  list_price_paise: 129900,
  currency: "INR",
  refundable: false,
  in_stock: true,
};
const STOLE = {
  ...KURTA,
  sku: "item_stole",
  label: "Nilgiri handloom stole, cotton-silk",
};

describe("what a purchase presents", () => {
  it("drops a row sharing no ground with the request", () => {
    const shown = requestedListings(
      [KURTA, STOLE],
      "a navy kurta under 2000, refundable",
    );
    expect(shown.map((row) => row.sku)).toEqual(["item_kurta"]);
  });

  it("presents nothing when no row matches anything asked", () => {
    // A wandering errand once carded a marketplace home page's deals
    // carousel — girls' dresses and a smartwatch under an SSD request. The
    // old fallback kept the whole set when the filter emptied it; the honest
    // presentation is no cards at all, with the prose left standing.
    const DRESS = {
      ...KURTA,
      sku: "item_dress",
      label: "T2F Girls Cotton Knee-Length Casual Dress, pack of 3",
    };
    const WATCH = {
      ...KURTA,
      sku: "item_watch",
      label: "NoiseFit Halo smartwatch, Bluetooth calling",
    };
    const shown = requestedListings(
      [DRESS, WATCH],
      "go with the Crucial E100 1TB internal SSD",
    );
    expect(shown).toHaveLength(0);
  });
});
