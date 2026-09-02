// `requires_refundability` was a literal `true` on every deterministic draft,
// and `refundable` on a live Razorpay item is always false because the entity
// carries no returns policy. Every live cart therefore died on
// REFUNDABILITY_REQUIRED, over a term most shoppers never asked for. Live
// mode no longer reads the sentence at all: the model proposes
// `requires_refundability` and the human sees it on the sheet. This is the
// scripted fake model's reading, kept because the scripted demo is the
// key-less judge's first run.
import type { CatalogSku, IssuedQuote } from "@covenant/agents";
import { UNCATEGORISED } from "@covenant/agents";
import { REFUND_POLICY_KEY } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { draftFieldsFor } from "../src/session/scripted-draft.js";
import { demandsRefund } from "../src/session/scripted-reading.js";
import { paymentRequestFor } from "../src/purchase/payment-request.js";

const CONFIG = {
  merchantIss: "urn:covenant:merchant:kolam-run",
  capPaise: 250_000,
  currency: "INR",
};

const LIVE_ITEM: CatalogSku = {
  sku: "item_TWNIHOyaam98x4",
  label: "Navy cotton kurta, M",
  category: UNCATEGORISED,
  listPricePaise: 129900,
  currency: "INR",
  floorPricePaise: 129900,
  refundable: false,
  stock: Number.MAX_SAFE_INTEGER,
  description: "Handloom cotton, refundable within 30 days",
  imageUrl: null,
};

function quoteFor(refundable: boolean): IssuedQuote {
  return {
    jws: "jws",
    claims: {
      quote_jti: "urn:uuid:q1",
      merchant_id: "kolam-run",
      sku_id: LIVE_ITEM.sku,
      total_paise: 129900,
      asked_unit_paise: null,
      floor_unit_paise: 129900,
      list_unit_paise: 129900,
      refundable,
      currency: "INR",
      line_items: [],
      lines_hash: "sha256:0",
      quote_expiry: "2026-08-31T10:00:00.000Z",
      reservation_id: "resv_1",
      reservation_expires_at: "2026-08-31T10:05:00.000Z",
    },
    ref: {
      quote_jti: "urn:uuid:q1",
      quote_total_paise: 129900,
      quote_expiry: "2026-08-31T10:00:00.000Z",
      reservation_id: "resv_1",
      reservation_expires_at: "2026-08-31T10:05:00.000Z",
    },
  } as unknown as IssuedQuote;
}

function modifiersFor(refundable: boolean) {
  return paymentRequestFor(LIVE_ITEM, quoteFor(refundable), "urn:cart:1")
    .details.modifiers;
}

describe("the refundability bound follows the shopper, not a literal", () => {
  it("signs it when the shopper asked to be able to send it back", () => {
    const drafted = draftFieldsFor(
      "a navy kurta under 2000, refundable please",
      LIVE_ITEM,
      CONFIG,
    );

    expect(drafted.requires_refundability).toBe(true);
    expect(drafted.natural_language_description).toContain("refundable only");
  });

  it("does not sign it over a request that never mentioned returns", () => {
    const drafted = draftFieldsFor(
      "a navy kurta under 2000",
      LIVE_ITEM,
      CONFIG,
    );

    expect(drafted.requires_refundability).toBe(false);
    expect(drafted.natural_language_description).not.toContain("refundable");
  });

  it("reads the ask, not the merchant's prose about their own listing", () => {
    expect(demandsRefund(LIVE_ITEM.description)).toBe(true);
    expect(
      draftFieldsFor("a navy kurta under 2000", LIVE_ITEM, CONFIG)
        .requires_refundability,
    ).toBe(false);
  });
});

describe("what a draft may name", () => {
  it("envelopes a live listing under the category it actually declares", () => {
    expect(
      draftFieldsFor("a navy kurta", LIVE_ITEM, CONFIG).envelopes[0]?.category,
    ).toBe(UNCATEGORISED);
  });

  it("names no envelope at all for a row that declares no category", () => {
    const uncategorised = { ...LIVE_ITEM, category: "" };

    expect(
      draftFieldsFor("a navy kurta", uncategorised, CONFIG).envelopes,
    ).toEqual([]);
  });
});

describe("the cart's refund promise rests on the merchant's signature", () => {
  it("declares a refund policy only when the signed quote attests one", () => {
    expect(modifiersFor(true)?.[0]?.data?.[REFUND_POLICY_KEY]).toBe(
      "14_day_full_refund",
    );
  });

  it("promises nothing for a listing whose seller attested nothing", () => {
    expect(modifiersFor(false)).toEqual([]);
  });
});
