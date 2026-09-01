import type { CooloffToPass } from "@covenant/domain";
import { describe, expect, it } from "vitest";

import { CooloffCheck } from "../../src/index.js";
import { goldenContext } from "../context.js";

const check = new CooloffCheck();

const BLACKOUT = {
  starts_at: "2026-08-31T09:00:00.000Z",
  ends_at: "2026-08-31T14:00:00.000Z",
};

describe("CooloffCheck", () => {
  it("passes below the threshold", () => {
    expect(check.run(goldenContext()).outcome).toBe("pass");
  });

  it("passes when no cool-off rule is configured at all", () => {
    expect(
      check.run(goldenContext({ context: { cooloffRule: null } })).outcome,
    ).toBe("pass");
  });

  it("holds at the threshold — `>=`, so the boundary is inside the rule", () => {
    const verdict = check.run(
      goldenContext({
        context: { cooloffRule: { threshold_paise: 189900, hold_seconds: 86400 } },
      }),
    );
    expect(verdict.outcome).toBe("hold");
    expect(verdict.reason_code).toBe("COOLOFF_HOLD");
    const toPass = verdict.to_pass as CooloffToPass;
    expect(toPass.executes_at).toBe("2026-09-01T10:00:00.000Z");
    expect(toPass.hold_seconds).toBe(86400);
  });

});

describe("CooloffCheck — blackout windows", () => {
  it("holds inside a blackout window even under the threshold", () => {
    const verdict = check.run(goldenContext({ context: { blackout: BLACKOUT } }));
    expect(verdict.outcome).toBe("hold");
    const toPass = verdict.to_pass as CooloffToPass;
    expect(toPass.executes_at).toBe(BLACKOUT.ends_at);
    expect(toPass.blackout_window).toEqual(BLACKOUT);
  });

  it("takes the later of the hold and the blackout end", () => {
    const verdict = check.run(
      goldenContext({
        context: {
          cooloffRule: { threshold_paise: 1, hold_seconds: 60 },
          blackout: BLACKOUT,
        },
      }),
    );
    const toPass = verdict.to_pass as CooloffToPass;
    expect(toPass.executes_at).toBe(BLACKOUT.ends_at);
  });

});

describe("CooloffCheck — the hold itself", () => {
  // F6: §6.2's own numbers — a 24h hold on a 24h intent — used to push every
  // above-threshold cart past `exp`, so the cool-off the user asked for became
  // a dead end instead of a wait. It now clamps to the expiry and holds.
  it("clamps a hold that would outlive the authorization, and still holds", () => {
    const verdict = check.run(
      goldenContext({
        intent: { exp: "2026-08-31T12:00:00.000Z" },
        context: { cooloffRule: { threshold_paise: 1, hold_seconds: 86400 } },
      }),
    );
    expect(verdict.outcome).toBe("hold");
    expect(verdict.reason_code).toBe("COOLOFF_HOLD");
    const toPass = verdict.to_pass as CooloffToPass;
    expect(toPass.executes_at).toBe("2026-08-31T12:00:00.000Z");
    expect(toPass.remedy).toBe("wait_or_cancel");
  });

  it("still fails when no schedulable instant exists at all", () => {
    const verdict = check.run(
      goldenContext({
        intent: { exp: "2026-08-31T09:00:00.000Z" },
        context: { cooloffRule: { threshold_paise: 1, hold_seconds: 60 } },
      }),
    );
    expect(verdict.outcome).toBe("fail");
    expect(verdict.reason_code).toBe("COOLOFF_EXCEEDS_INTENT_EXPIRY");
  });

  it("offers a cancel url keyed on the hold id, which is the cart jti", () => {
    const context = goldenContext({
      context: { cooloffRule: { threshold_paise: 1, hold_seconds: 60 } },
    });
    const toPass = check.run(context).to_pass as CooloffToPass;
    expect(toPass.hold_id).toBe(context.cart.jti);
    expect(toPass.cancel_url).toBe(`/v1/cooloff/${context.cart.jti}/cancel`);
  });
});
