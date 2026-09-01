import { describe, expect, it } from "vitest";

import {
  applyEdits,
  unknownPredicates,
  type CovenantEdits,
} from "../src/covenant/amend-bounds.js";
import { baseBounds } from "../src/covenant/current-bounds.js";

const EXPIRY = "2026-10-01T00:00:00.000Z";

function edits(partial: Partial<CovenantEdits>): CovenantEdits {
  return {
    bounds: [],
    envelopes: [],
    merchants: [],
    skus: [],
    ...partial,
  };
}

const base = baseBounds(EXPIRY, "INR");

describe("sealing carries the whole covenant", () => {
  it("carries every bound forward, not only the edited one", () => {
    const held = applyEdits(
      base,
      edits({
        merchants: ["urn:covenant:merchant:kanchi"],
        bounds: [{ predicate: "max_amount", value: 200_000 }],
      }),
    );
    const next = applyEdits(
      held,
      edits({ bounds: [{ predicate: "hold_seconds", value: 86_400 }] }),
    );
    // The trap this exists to catch: editing a cool-off must not drop the
    // merchant allowlist, because the mandate is written from the whole set.
    expect(next.merchants).toEqual(["urn:covenant:merchant:kanchi"]);
    expect(next.allowance.max_amount).toBe(200_000);
    expect(next.cooloff?.hold_seconds).toBe(86_400);
  });

  it("moves the allowance expiry with the intent expiry", () => {
    const at = "2026-12-25T00:00:00.000Z";
    const next = applyEdits(
      base,
      edits({ bounds: [{ predicate: "intent_expiry", value: at }] }),
    );
    expect(next.intent_expiry).toBe(at);
    expect(next.allowance.expires_at).toBe(at);
  });
});

describe("sealing refuses what it cannot apply", () => {
  it("refuses a predicate it cannot apply, by name", () => {
    const asked = edits({ bounds: [{ predicate: "category_ban", value: 1 }] });
    expect(unknownPredicates(asked)).toEqual(["category_ban"]);
  });

  it("keeps a bound unchanged when the value is the wrong shape", () => {
    const next = applyEdits(
      base,
      edits({ bounds: [{ predicate: "max_amount", value: "lots" }] }),
    );
    expect(next.allowance.max_amount).toBe(base.allowance.max_amount);
  });
});

describe("sealing merges lists rather than replacing them", () => {
  it("adds an envelope cap without disturbing the others", () => {
    const held = applyEdits(
      base,
      edits({ envelopes: [{ category: "apparel", capPaise: 500_000 }] }),
    );
    const next = applyEdits(
      held,
      edits({ envelopes: [{ category: "grocery", capPaise: 100_000 }] }),
    );
    expect(next.envelopes).toHaveLength(2);
    expect(next.envelopes.map((e) => e.cap_paise)).toEqual([500_000, 100_000]);
  });

  it("keeps quiet hours through an unrelated edit", () => {
    const quiet = { tz: "Asia/Kolkata", from: "23:00", to: "06:00" };
    const held = applyEdits(base, edits({ blackout: quiet }));
    const next = applyEdits(
      held,
      edits({ bounds: [{ predicate: "max_amount", value: 5_000 }] }),
    );
    expect(next.blackout_hours).toEqual(quiet);
  });

  it("does not duplicate a merchant already allowed", () => {
    const held = applyEdits(base, edits({ merchants: ["a"] }));
    expect(
      applyEdits(held, edits({ merchants: ["a", "b"] })).merchants,
    ).toEqual(["a", "b"]);
  });
});
