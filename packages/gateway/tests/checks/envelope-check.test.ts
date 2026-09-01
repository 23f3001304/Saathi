import type { EnvelopeState, EnvelopeToPass } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { EnvelopeCheck } from "../../src/index.js";
import { goldenContext } from "../context.js";
import { CART_TOTAL_PAISE } from "../fixtures.js";

const check = new EnvelopeCheck();

function envelope(overrides: Partial<EnvelopeState>): EnvelopeState {
  return {
    category: "footwear",
    period: "month",
    capPaise: 500000,
    committedPaise: 0,
    openReservedPaise: 0,
    resetsAt: "2026-09-01T00:00:00.000Z",
    oldestReservationExpiresAt: null,
    ...overrides,
  };
}

describe("EnvelopeCheck", () => {
  it("passes well under the cap", () => {
    expect(check.run(goldenContext()).outcome).toBe("pass");
  });

  it("passes at the exact boundary — remaining equals the draw", () => {
    const context = goldenContext({
      context: { envelopes: [envelope({ capPaise: CART_TOTAL_PAISE })] },
    });
    expect(check.run(context).outcome).toBe("pass");
  });

  it("fails ENVELOPE_EXCEEDED one paise over", () => {
    const context = goldenContext({
      context: { envelopes: [envelope({ capPaise: CART_TOTAL_PAISE - 1 })] },
    });
    const verdict = check.run(context);
    expect(verdict.reason_code).toBe("ENVELOPE_EXCEEDED");
    const toPass = verdict.to_pass as EnvelopeToPass;
    expect(toPass.requested_paise).toBe(CART_TOTAL_PAISE);
    expect(toPass.remaining_paise).toBe(CART_TOTAL_PAISE - 1);
  });

});

describe("EnvelopeCheck — reservations and commitments", () => {
  it("fails only because of another verification's open reservation", () => {
    const context = goldenContext({
      context: {
        envelopes: [
          envelope({
            capPaise: 300000,
            openReservedPaise: 150000,
            oldestReservationExpiresAt: "2026-08-31T10:25:00.000Z",
          }),
        ],
      },
    });
    const verdict = check.run(context);
    expect(verdict.reason_code).toBe("ENVELOPE_EXCEEDED");
    const toPass = verdict.to_pass as EnvelopeToPass;
    expect(toPass.open_reservations_paise).toBe(150000);
    // The loser is told exactly when capacity frees up.
    expect(toPass.oldest_reservation_expires_at).toBe(
      "2026-08-31T10:25:00.000Z",
    );
  });

  it("counts committed spend against the same cap", () => {
    const context = goldenContext({
      context: { envelopes: [envelope({ capPaise: 300000, committedPaise: 150000 })] },
    });
    expect(check.run(context).reason_code).toBe("ENVELOPE_EXCEEDED");
  });

});

describe("EnvelopeCheck — undeclared categories", () => {
  it("passes an undeclared category while a human is present", () => {
    expect(
      check.run(goldenContext({ context: { envelopes: [] } })).outcome,
    ).toBe("pass");
  });

  it("fails ENVELOPE_UNDECLARED_HNP with no human and no envelope", () => {
    const verdict = check.run(
      goldenContext({
        intent: { human_present: false },
        context: { envelopes: [] },
      }),
    );
    expect(verdict.reason_code).toBe("ENVELOPE_UNDECLARED_HNP");
    const toPass = verdict.to_pass as EnvelopeToPass;
    expect(toPass.category).toBe("footwear");
  });
});
