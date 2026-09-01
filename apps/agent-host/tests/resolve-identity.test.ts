// The draft schema asks a model for `merchants` and `skus`, so it supplied
// plausible strings — the shop's display name, a product title — and every cart
// failed: MERCHANT_NOT_ALLOWED, then SKU_NOT_ALLOWED, on a purchase that was in
// every other respect exactly what the shopper asked for. A bound naming
// something that does not exist is not a bound.
import { describe, expect, it } from "vitest";

import {
  resolveIdentity,
  UnresolvableDraft,
} from "../src/judge/resolve-identity.js";

const CATALOG = [
  {
    sku: "ASC-GC9-UK8",
    label: "Kolam Run Gc9 road shoe, UK 8",
    category: "footwear",
  },
  {
    sku: "ST-KURTA-NAVY-M",
    label: "Navy cotton kurta, M",
    category: "apparel",
  },
] as never;

const IDENTITY = {
  merchantIss: "urn:covenant:merchant:kolam-run",
  catalog: CATALOG,
};

function resolved(draft: Record<string, unknown>): Record<string, unknown> {
  return resolveIdentity(draft, IDENTITY) as Record<string, unknown>;
}

describe("who sells it is not the model's to say", () => {
  it("replaces whatever the model called the merchant", () => {
    const out = resolved({ merchants: ["Kolam Run"], skus: ["ASC-GC9-UK8"] });
    expect(out["merchants"]).toEqual(["urn:covenant:merchant:kolam-run"]);
  });

  it("keeps the model's choice of product, by its real id", () => {
    const out = resolved({ merchants: [], skus: ["asc-gc9-uk8"] });
    expect(out["skus"]).toEqual(["ASC-GC9-UK8"]);
  });

  it("resolves a product the model named the way a human would", () => {
    const out = resolved({ skus: ["Navy cotton kurta, M"] });
    expect(out["skus"]).toEqual(["ST-KURTA-NAVY-M"]);
  });
});

describe("a bound naming nothing real is not a bound", () => {
  it("does not sign a bound naming a product nobody sells", () => {
    expect(() => resolved({ skus: ["Imaginary sneaker"] })).toThrow(
      UnresolvableDraft,
    );
  });

  it("refuses an empty choice rather than inventing one", () => {
    expect(() => resolved({ skus: [] })).toThrow(UnresolvableDraft);
  });

  it("never lets the same product in twice", () => {
    const out = resolved({
      skus: ["ASC-GC9-UK8", "Kolam Run Gc9 road shoe, UK 8"],
    });
    expect(out["skus"]).toEqual(["ASC-GC9-UK8"]);
  });

  it("leaves everything else the model decided alone", () => {
    const out = resolved({
      skus: ["ASC-GC9-UK8"],
      max_amount_paise: 400_000,
      requires_refundability: true,
    });
    expect(out["max_amount_paise"]).toBe(400_000);
    expect(out["requires_refundability"]).toBe(true);
  });
});
