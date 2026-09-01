import { describe, expect, it } from "vitest";

import { sealRequest } from "../src/covenant/sealRequest.ts";
import type { Constraint } from "../src/api/types.ts";
import type { CovenantDrafts } from "../src/covenant/sealLines.ts";

function drafts(partial: Partial<CovenantDrafts>): CovenantDrafts {
  return {
    constraints: [],
    added: [],
    envCaps: {},
    cooloff: {},
    scopeAdds: { merchants: [], skus: [] },
    proposed: [],
    ...partial,
  };
}

function rule(
  key: string,
  value: string | number | boolean,
  unit?: Constraint["unit"],
): Constraint {
  return { key, label: key, value, amended: true, ...(unit ? { unit } : {}) };
}

describe("the seal converts display units to wire units", () => {
  it("converts a cool-off from the hours it displays to the seconds it means", () => {
    const request = sealRequest(
      drafts({ cooloff: { durationHours: "24" } }),
      "one change",
    );
    expect(request.bounds).toEqual([
      { predicate: "hold_seconds", value: 86_400 },
    ]);
  });

  it("converts an APR from percent to basis points", () => {
    const request = sealRequest(
      drafts({
        constraints: [
          { ...rule("max_apr_bps", "18", "percent"), amended: true },
        ],
      }),
      "one change",
    );
    expect(request.bounds).toEqual([{ predicate: "max_apr_bps", value: 1800 }]);
  });

  it("sends a paise bound at face value", () => {
    const request = sealRequest(
      drafts({
        constraints: [
          { ...rule("max_amount", "200000", "paise"), amended: true },
        ],
      }),
      "one change",
    );
    expect(request.bounds).toEqual([
      { predicate: "max_amount", value: 200_000 },
    ]);
  });
});

describe("the seal sends only what was changed", () => {
  it("sends only the rules that were actually amended", () => {
    const request = sealRequest(
      drafts({
        constraints: [{ ...rule("human_present", true), amended: false }],
      }),
      "nothing",
    );
    expect(request.bounds).toEqual([]);
  });

  it("reads a typed boolean back as a boolean", () => {
    const request = sealRequest(
      drafts({
        constraints: [
          {
            ...rule("requires_refundability", "false", "boolean"),
            amended: true,
          },
        ],
      }),
      "one change",
    );
    expect(request.bounds).toEqual([
      { predicate: "requires_refundability", value: false },
    ]);
  });
});

describe("the seal keeps composites beside the scalars", () => {
  it("sends quiet hours as a window in the reader's own timezone", () => {
    const request = sealRequest(
      drafts({
        added: [
          { ...rule("blackout_hours", "23:00-06:00", "window"), amended: true },
        ],
      }),
      "one change",
    );
    expect(request.blackout).toEqual({
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      from: "23:00",
      to: "06:00",
    });
    // A composite travels beside the scalars, never among them.
    expect(request.bounds).toEqual([]);
  });
});

describe("the seal carries the agent's own proposals", () => {
  it("routes an agent's envelope proposal to the envelope list", () => {
    const request = sealRequest(
      drafts({
        proposed: [
          {
            id: "urn:covenant:amendment:1",
            summary: "Tighten the apparel budget",
            proposedAt: "2026-08-31T10:00:00.000Z",
            changes: [
              {
                rule: "cap_paise",
                scope: "apparel",
                from: 500_000,
                to: 300_000,
                unit: "paise",
                currency: "INR",
              },
            ],
          },
        ],
      }),
      "one change",
    );
    expect(request.envelopes).toEqual([
      { category: "apparel", cap_paise: 300_000 },
    ]);
    expect(request.bounds).toEqual([]);
  });
});
