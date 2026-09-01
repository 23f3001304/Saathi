import type { QuoteMatchToPass } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { QuoteMatchCheck } from "../../src/index.js";
import { goldenContext } from "../context.js";
import { QUOTE } from "../fixtures.js";

const check = new QuoteMatchCheck();

const DRIP_REQUEST = {
  ...goldenContext().cart.payment_request,
  details: {
    ...goldenContext().cart.payment_request.details,
    displayItems: [
      {
        label: "Asics Gel-Contend 9 (UK 8)",
        amount: { currency: "INR", value: "1900.00" },
        sku: "ASC-GC9-UK8",
        category: "footwear",
        quantity: 1,
      },
    ],
  },
};

describe("QuoteMatchCheck", () => {
  it("passes when all three hashes and the signed total agree", () => {
    expect(check.run(goldenContext()).outcome).toBe("pass");
  });

  it("fails CART_HASH_MISMATCH when the cart's own hash does not recompute", () => {
    const verdict = check.run(
      goldenContext({ cart: { cart_hash: `sha256:${"9".repeat(64)}` } }),
    );
    expect(verdict.reason_code).toBe("CART_HASH_MISMATCH");
  });

  it("fails CART_HASH_MISMATCH when the merchant authorization signed another cart", () => {
    const base = goldenContext();
    const verdict = check.run({
      ...base,
      merchantAuth: { ...base.merchantAuth, cartHash: `sha256:${"8".repeat(64)}` },
    });
    expect(verdict.reason_code).toBe("CART_HASH_MISMATCH");
  });

});

describe("QuoteMatchCheck — the signed quote", () => {
  it("fails CART_QUOTE_MISMATCH when no P2 quote resolves for the jti", () => {
    expect(
      check.run(goldenContext({ context: { signedQuote: null } })).reason_code,
    ).toBe("CART_QUOTE_MISMATCH");
  });

  it("fails CART_QUOTE_MISMATCH when the quote is only an unsigned scrape", () => {
    const base = goldenContext();
    expect(
      check.run({
        ...base,
        signedQuote: { ...base.signedQuote!, tier: 0 },
      }).reason_code,
    ).toBe("CART_QUOTE_MISMATCH");
  });

  it("kills a one-rupee drip: the total must match exactly, no tolerance", () => {
    const base = goldenContext({ cart: { payment_request: DRIP_REQUEST } });
    const verdict = check.run({
      ...base,
      computedCartHash: base.cart.cart_hash,
      merchantAuth: { ...base.merchantAuth, cartHash: base.cart.cart_hash },
    });
    expect(verdict.reason_code).toBe("CART_QUOTE_MISMATCH");
    const toPass = verdict.to_pass as QuoteMatchToPass;
    expect(toPass.delta_paise).toBe(100);
    expect(toPass.remedy).toBe("renegotiate");
  });

});

describe("QuoteMatchCheck — freshness", () => {
  it("fails QUOTE_EXPIRED once the quote's own expiry has passed", () => {
    const verdict = check.run(
      goldenContext({
        cart: { quote: { ...QUOTE, quote_expiry: "2026-08-31T09:59:00.000Z" } },
      }),
    );
    expect(verdict.reason_code).toBe("QUOTE_EXPIRED");
  });

  it("fails QUOTE_EXPIRED once the stock reservation has lapsed", () => {
    const verdict = check.run(
      goldenContext({
        context: {
          stockReservation: {
            reservation_id: QUOTE.reservation_id,
            merchant_id: "urn:covenant:merchant:kolam-run",
            sku_id: "ASC-GC9-UK8",
            qty: 1,
            quote_jti: QUOTE.quote_jti,
            cart_mandate_id: "urn:uuid:22222222-2222-4222-8222-222222222222",
            state: "claimed",
            expires_at: "2026-08-31T09:30:00.000Z",
          },
        },
      }),
    );
    expect(verdict.reason_code).toBe("QUOTE_EXPIRED");
  });
});
