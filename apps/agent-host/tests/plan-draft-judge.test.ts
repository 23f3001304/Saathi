// The draft the sheet shows is the one the planner's propose_purchase call
// carried, completed by facts the host holds: who sells it, what currency the
// covenant is in, and the monthly envelope policy. No second model, no regex.
import {
  DEMO_CATALOG,
  DEMO_MERCHANT_ISS,
  INTENT_DRAFT_PROMPT_ID,
  IntentDrafter,
} from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { PlanDraftJudge } from "../src/judge/plan-draft-judge.js";
import { PendingDraft } from "../src/purchase/pending-draft.js";
import { StepClock } from "./support/fakes.js";

const CONFIG = { merchantIss: DEMO_MERCHANT_ISS, capPaise: 250_000, currency: "INR" };

const SHELF = { current: () => DEMO_CATALOG };

const DRAFT = {
  sku: "ST-KURTA-NAVY-M",
  maxAmountPaise: 200_000,
  requiresRefundability: true,
  description: "a navy cotton kurta, M, at most 2000 rupees",
};

const INPUT = { conversation: ["a navy kurta"], currency: "INR" };

const echo = (value: unknown): Record<string, unknown> =>
  value as Record<string, unknown>;

function heldJudge(draft = DRAFT): PlanDraftJudge {
  const pending = new PendingDraft();
  pending.hold(draft);
  return new PlanDraftJudge(pending, CONFIG, SHELF);
}

const DEFAULTS = {
  currency: "INR",
  maxAmountPaise: 250_000,
  ttlSeconds: 86_400,
  cooloff: null,
  creditPolicy: { allow_credit: false, max_apr_bps: 0 },
  humanPresent: true,
  userCartConfirmationRequired: false,
  shareAggregates: false,
  judgeTimeoutMs: 1000,
};

const REQUEST = {
  conversation: ["a navy kurta"],
  userIss: "usr_1",
  tenantId: "tnt_demo",
  agentInstanceId: "agi_1",
};

function drafterWith(judge: PlanDraftJudge): IntentDrafter {
  const issuer = {
    issue: () => Promise.reject(new Error("nothing may be issued here")),
  };
  return new IntentDrafter(judge, issuer as never, new StepClock(), DEFAULTS);
}

describe("the draft is what the planner proposed", () => {
  it("completes the model's fields with the host's facts", async () => {
    const fields = await heldJudge().judge(INTENT_DRAFT_PROMPT_ID, INPUT, echo);
    expect(fields).toEqual({
      natural_language_description: DRAFT.description,
      max_amount_paise: 200_000,
      currency: "INR",
      merchants: [DEMO_MERCHANT_ISS],
      skus: ["ST-KURTA-NAVY-M"],
      requires_refundability: true,
      envelopes: [{ category: "apparel", period: "month", cap_paise: 2_000_000 }],
    });
  });

  it("refuses when no draft is held: a purchase is proposed, never assumed", async () => {
    const judge = new PlanDraftJudge(new PendingDraft(), CONFIG, SHELF);
    await expect(
      judge.judge(INTENT_DRAFT_PROMPT_ID, INPUT, echo),
    ).rejects.toThrow("no draft held");
  });

  it("refuses a sku the shelf no longer holds", async () => {
    await expect(
      heldJudge({ ...DRAFT, sku: "GONE" }).judge(INTENT_DRAFT_PROMPT_ID, INPUT, echo),
    ).rejects.toThrow("does not hold");
  });
});

describe("the operator's cap still binds, as a schema literal", () => {
  it("rejects a draft above the cap before anything is signed", async () => {
    const drafter = drafterWith(heldJudge({ ...DRAFT, maxAmountPaise: 250_001 }));
    await expect(drafter.draft(REQUEST)).rejects.toThrow();
  });

  it("drafts bounds from the held draft when it fits", async () => {
    const drafted = await drafterWith(heldJudge()).draft(REQUEST);
    expect(drafted.naturalLanguageDescription).toBe(DRAFT.description);
    expect(drafted.bounds.allowance.max_amount).toBe(200_000);
    expect(drafted.bounds.skus).toEqual(["ST-KURTA-NAVY-M"]);
    expect(drafted.bounds.merchants).toEqual([DEMO_MERCHANT_ISS]);
    expect(drafted.bounds.requires_refundability).toBe(true);
  });
});
