import { describe, expect, it } from "vitest";

import { MoneyToolRegistry } from "../src/buyer/money-tool-registry.js";
import {
  DEFAULT_AMENDMENT_CONTEXT,
  parseAmendment,
} from "../src/buyer/amendment-schema.js";
import {
  directionOf,
  widensAnything,
} from "../src/buyer/covenant-amendment.js";
import { AMEND_TOOL, BUYER_TOOL_SERVER } from "../src/buyer/turn-plan.js";
import { TURN_PLAN_TOOLS } from "../src/buyer/turn-plan-tools.js";
import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";
import { amend, change, planFrom, SIGNED_CAP_PAISE } from "./amendments.js";

describe("the fourth move", () => {
  it("is declared on the buyer's server and moves no money", () => {
    const declared = TURN_PLAN_TOOLS.find((tool) => tool.tool === AMEND_TOOL);
    expect(declared?.server).toBe(BUYER_TOOL_SERVER);
    expect(new MoneyToolRegistry().isMoneyAffecting(AMEND_TOOL)).toBe(false);
  });

  it("records a proposal, never an application", async () => {
    const { plan } = await planFrom(new TurnPlanCollector(), amend([change()]));
    expect(plan?.action).toBe("propose_amendment");
    expect(plan?.amendment?.changes).toHaveLength(1);
    expect(plan?.amendment?.summary).toBe("Cap apparel at ₹3,000");
  });
});

/**
 * The property the card is drawn from. A model that raises a ceiling while
 * calling the change a tightening is the whole attack, so nothing it asserts
 * about direction is read — the arithmetic is.
 */
describe("direction is computed, never claimed", () => {
  it("calls a raised ceiling a widening, whatever the model says", async () => {
    const { plan } = await planFrom(
      new TurnPlanCollector(),
      amend([
        change({ to: 900_000, direction: "narrows", note: "this tightens it" }),
      ]),
    );
    expect(plan?.amendment?.changes[0]?.direction).toBe("widens");
    expect(widensAnything(plan!.amendment!)).toBe(true);
  });

  it("calls a lowered ceiling a narrowing", () => {
    expect(directionOf("max_amount", SIGNED_CAP_PAISE, 100_000)).toBe(
      "narrows",
    );
  });

  it("reads a wait the other way round", () => {
    expect(directionOf("hold_seconds", 86_400, 3_600)).toBe("widens");
    expect(directionOf("hold_seconds", 3_600, 86_400)).toBe("narrows");
  });

  it("calls a bound that did not exist before a narrowing", () => {
    expect(directionOf("hold_seconds", null, 86_400)).toBe("narrows");
  });
});

describe("direction, for the rules that are not numbers", () => {
  it("reads a flag by which value lets the agent do more", () => {
    expect(directionOf("allow_credit", false, true)).toBe("widens");
    expect(directionOf("requires_refundability", true, false)).toBe("widens");
    expect(directionOf("requires_refundability", false, true)).toBe("narrows");
  });

  it("reads a merchant being shut out as a narrowing", () => {
    expect(directionOf("merchant", true, false)).toBe("narrows");
    expect(directionOf("merchant", false, true)).toBe("widens");
  });

  it("treats a rule it does not know as the dangerous reading", () => {
    expect(directionOf("cap_on_vibes", 1, 2)).toBe("widens");
  });
});

/** Nonsense is refused before it is ever shown as something to sign. */
const REFUSED: readonly [string, Record<string, unknown>][] = [
  ["a negative cap", amend([change({ to: -300_000 })])],
  ["a fractional cap", amend([change({ to: 1_234.5 })])],
  ["a zero cap", amend([change({ to: 0 })])],
  ["a foreign currency", amend([change({ currency: "USD" })])],
  ["an unknown rule key", amend([change({ rule: "spend_whatever" })])],
  ["a flag where a number belongs", amend([change({ to: true })])],
  ["a change that changes nothing", amend([change({ to: SIGNED_CAP_PAISE })])],
  ["an unscoped category cap", amend([change({ rule: "cap_paise" })])],
  [
    "a merchant rule naming no merchant",
    amend([change({ rule: "merchant", from: true, to: false })]),
  ],
  ["no changes at all", amend([])],
];

describe("the schema decides what may be shown", () => {
  for (const [what, args] of REFUSED) {
    it(`refuses ${what}, and leaves the model to say so itself`, async () => {
      const { outcome, plan } = await planFrom(new TurnPlanCollector(), args);
      expect(outcome.isError).toBe(true);
      // No plan was recorded for it: the refusal went back to the model as a
      // tool error, and whatever the model then says is the turn.
      expect(plan).toBeNull();
    });
  }

  it("accepts the covenant's own currency", () => {
    const parsed = parseAmendment(
      amend([change({ currency: "INR", unit: "paise" })]),
      DEFAULT_AMENDMENT_CONTEXT,
    );
    expect(parsed.ok).toBe(true);
  });
});
