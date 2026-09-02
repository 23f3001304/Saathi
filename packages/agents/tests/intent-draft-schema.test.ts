import { describe, expect, it } from "vitest";

import { draftSchemaFor } from "../src/buyer/intent-draft-fields.js";

describe("intent draft validation", () => {
  const schema = draftSchemaFor("INR", 250_000);
  const valid = {
    natural_language_description: "one brass lamp",
    max_amount_paise: 120_000,
    currency: "INR",
    merchants: ["mrc_1"],
    skus: ["SKU-1"],
    requires_refundability: true,
    envelopes: [],
  };

  it("accepts a bounded INR draft", () => {
    expect(schema.parse(valid)).toEqual(valid);
  });

  it("rejects a currency the covenant does not hold", () => {
    expect(() => schema.parse({ ...valid, currency: "USD" })).toThrow();
  });

  it("rejects a ceiling of zero", () => {
    expect(() => schema.parse({ ...valid, max_amount_paise: 0 })).toThrow();
  });

  it("rejects a ceiling above the one already drafted", () => {
    expect(() =>
      schema.parse({ ...valid, max_amount_paise: 250_001 }),
    ).toThrow();
  });

  it("rejects a draft that names no merchant or no SKU", () => {
    expect(() => schema.parse({ ...valid, merchants: [] })).toThrow();
    expect(() => schema.parse({ ...valid, skus: null })).toThrow();
  });
});
