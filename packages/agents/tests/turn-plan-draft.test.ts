// The draft the sheet shows is the one the model proposed, checked at the
// tool boundary: the operator's cap and the shelf are the only two facts the
// check holds, and both are refused back to the model with a name it can act
// on rather than silently rewritten.
import { describe, expect, it } from "vitest";

import type { DraftBounds } from "../src/buyer/turn-plan-draft.js";
import { draftOf } from "../src/buyer/turn-plan-draft.js";
import { DEMO_CATALOG } from "../src/merchant/demo-catalog.js";

const BOUNDS: DraftBounds = {
  capPaise: 250_000,
  currency: "INR",
  shelf: { current: () => DEMO_CATALOG },
};

const ARGS = {
  reply: "Drafting that now.",
  sku: "ST-KURTA-NAVY-M",
  max_amount_paise: 200_000,
  requires_refundability: true,
  description: "a navy cotton kurta, size M, at most 2000 rupees",
};

describe("what propose_purchase carried", () => {
  it("becomes the draft the sheet will show", () => {
    expect(draftOf(ARGS, BOUNDS)).toEqual({
      ok: true,
      draft: {
        sku: "ST-KURTA-NAVY-M",
        maxAmountPaise: 200_000,
        requiresRefundability: true,
        description: "a navy cotton kurta, size M, at most 2000 rupees",
      },
    });
  });

  it("refuses a ceiling above the operator's cap", () => {
    expect(draftOf({ ...ARGS, max_amount_paise: 250_001 }, BOUNDS)).toEqual({
      ok: false,
      failure: "cap_exceeded",
    });
  });

  it("refuses a sku this shelf does not hold", () => {
    expect(draftOf({ ...ARGS, sku: "NOT-HERE" }, BOUNDS)).toEqual({
      ok: false,
      failure: "sku_not_on_shelf",
    });
  });
});

describe("a shape the tool boundary cannot read", () => {
  it("refuses a ceiling given as text", () => {
    expect(draftOf({ ...ARGS, max_amount_paise: "2000" }, BOUNDS)).toEqual({
      ok: false,
      failure: "bad_arguments",
    });
  });

  it("refuses a ceiling of zero", () => {
    expect(draftOf({ ...ARGS, max_amount_paise: 0 }, BOUNDS)).toEqual({
      ok: false,
      failure: "bad_arguments",
    });
  });

  it("refuses an empty description", () => {
    expect(draftOf({ ...ARGS, description: "" }, BOUNDS)).toEqual({
      ok: false,
      failure: "bad_arguments",
    });
  });

  it("parses the shape and checks nothing else when no bounds are given", () => {
    const parsed = draftOf(
      { ...ARGS, sku: "NOT-HERE", max_amount_paise: 9_999_999 },
      null,
    );
    expect(parsed.ok).toBe(true);
  });
});

// Spaces used to pass the bound and empty out afterwards, so the drafter's own
// min(1) threw where the model should have read `bad_arguments` and proposed
// again: the run ended failed, with no bubble and nothing to retry from.
describe("a field the model filled with nothing but spaces", () => {
  it("refuses a description that is only spaces", () => {
    expect(draftOf({ ...ARGS, description: "   " }, BOUNDS)).toEqual({
      ok: false,
      failure: "bad_arguments",
    });
  });

  it("refuses a sku that is only spaces", () => {
    expect(draftOf({ ...ARGS, sku: "   " }, BOUNDS)).toEqual({
      ok: false,
      failure: "bad_arguments",
    });
  });

  it("takes the padding off what it does accept", () => {
    expect(draftOf({ ...ARGS, description: "  a kurta  " }, BOUNDS)).toEqual({
      ok: true,
      draft: {
        sku: "ST-KURTA-NAVY-M",
        maxAmountPaise: 200_000,
        requiresRefundability: true,
        description: "a kurta",
      },
    });
  });
});
