import type { PriceFloorToPass, SkuPriceFloor } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { QuoteMatchCheck } from "../../src/index.js";
import type { VerdictContext } from "../../src/index.js";
import { goldenContext } from "../context.js";
import { CART_TOTAL_PAISE, SKU } from "../fixtures.js";

const check = new QuoteMatchCheck();

const FLOOR: SkuPriceFloor = {
  merchant_id: "kolam-run",
  sku_id: SKU,
  floor_paise: 170000,
  list_paise: 199900,
  currency: "INR",
  declared_at: "2026-08-31T09:00:00.000Z",
  declared_by: "merchant-2026-08-00000000",
};

/**
 * A cart priced at `unitPaise`, with the merchant's own signed quote agreeing.
 * The point of the check is what happens when a merchant agent signs something
 * its principal never authorised, so the quote must *not* be the thing that
 * disagrees — otherwise `CART_QUOTE_MISMATCH` would fire first and prove
 * nothing about the floor.
 */
function requestAt(unitPaise: number) {
  const details = goldenContext().cart.payment_request.details;
  return {
    ...goldenContext().cart.payment_request,
    details: {
      ...details,
      displayItems: [
        {
          ...details.displayItems[0],
          label: "Asics Gel-Contend 9 (UK 8)",
          sku: SKU,
          category: "footwear",
          quantity: 1,
          amount: { currency: "INR", value: (unitPaise / 100).toFixed(2) },
        },
      ],
    },
  };
}

function cartAt(
  unitPaise: number,
  floors: readonly SkuPriceFloor[],
): VerdictContext {
  const context = goldenContext({
    cart: { payment_request: requestAt(unitPaise) },
  });
  return {
    ...context,
    computedCartHash: context.cart.cart_hash,
    merchantAuth: { ...context.merchantAuth, cartHash: context.cart.cart_hash },
    signedQuote: { ...context.signedQuote!, total_paise: unitPaise },
    priceFloors: floors,
  };
}

describe("QuoteMatchCheck — the merchant's own floor", () => {
  it("passes a cart that settled inside the declared band", () => {
    expect(check.run(cartAt(180000, [FLOOR])).outcome).toBe("pass");
  });

  it("passes a cart that settled exactly at the floor", () => {
    expect(check.run(cartAt(170000, [FLOOR])).outcome).toBe("pass");
  });

  it("refuses a quote the merchant's own agent signed below the floor", () => {
    const verdict = check.run(cartAt(150000, [FLOOR]));

    expect(verdict.outcome).toBe("fail");
    expect(verdict.reason_code).toBe("QUOTE_BELOW_FLOOR");
  });
});

describe("QuoteMatchCheck — what a below-floor refusal hands back", () => {
  it("says how far under, against which band, and what to do about it", () => {
    const toPass = check.run(cartAt(150000, [FLOOR]))
      .to_pass as PriceFloorToPass;

    expect(toPass).toEqual({
      sku_id: SKU,
      floor_paise: 170000,
      list_paise: 199900,
      quoted_unit_paise: 150000,
      below_by_paise: 20000,
      currency: "INR",
      declared_at: FLOOR.declared_at,
      remedy: "request_new_quote",
    });
  });
});

describe("a floor is never inferred", () => {
  it("has no bound at all where the merchant declared none", () => {
    expect(check.run(cartAt(150000, [])).outcome).toBe("pass");
  });

  it("does not read another SKU's band onto this line", () => {
    const other = { ...FLOOR, sku_id: "some-other-sku" };

    expect(check.run(cartAt(150000, [other])).outcome).toBe("pass");
  });
});

describe("the buyer's ceiling still binds independently", () => {
  it("still refuses a cart the quote does not match, floor or no floor", () => {
    const context = cartAt(180000, [FLOOR]);
    const verdict = check.run({
      ...context,
      signedQuote: { ...context.signedQuote!, total_paise: CART_TOTAL_PAISE },
    });

    expect(verdict.reason_code).toBe("CART_QUOTE_MISMATCH");
  });
});
