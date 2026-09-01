import { randomUUID } from "node:crypto";

import { preparePurchase } from "../flow/purchase.js";
import { verifyCart } from "../flow/verdict.js";
import type { Harness } from "../harness.js";
import type { Transcript } from "../report/transcript.js";
import { purchaseCost, purchaseDetector, remedyOf } from "./attribution.js";
import type { PurchaseContext, PurchaseScenario, ScenarioResult } from "./types.js";

const STALE_TTL_MS = 900;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function contextFor(harness: Harness, id: string): PurchaseContext {
  const tag = `${id.toLowerCase()}-${randomUUID().slice(0, 8)}`;
  return { userId: `${harness.userIss}#fp-${tag}`, category: `fp-${tag}` };
}

/**
 * The re-quote scenario: a real quote whose TTL has genuinely elapsed is left
 * in the store, then the merchant re-attests. Faking the elapsed time would
 * measure the harness's clock rather than the gateway's.
 */
async function stalePrelude(
  harness: Harness,
  spec: ReturnType<PurchaseScenario["build"]>,
): Promise<void> {
  await preparePurchase(harness, { ...spec, quoteTtlMs: STALE_TTL_MS });
  await sleep(STALE_TTL_MS + 400);
}

/** A scenario that asked for a hold and got an approval is worth naming too. */
function detailOf(
  scenario: PurchaseScenario,
  verdict: { reasonCode: string | null; human: string | null; decision: string },
  held: boolean,
): string {
  if (held) {
    return `held by the user's own cool-off rule (${verdict.reasonCode ?? "COOLOFF_HOLD"})`;
  }
  if (scenario.expectHold === true && verdict.decision === "approve") {
    return "approved although the cart is above the cool-off threshold";
  }
  return verdict.human ?? verdict.decision;
}

async function runOne(
  harness: Harness,
  scenario: PurchaseScenario,
): Promise<ScenarioResult> {
  const context = contextFor(harness, scenario.id);
  const spec = scenario.build(harness, context);
  if (scenario.staleQuoteFirst === true) {
    await stalePrelude(harness, spec);
  }
  const prepared = await preparePurchase(harness, spec);
  const verdict = await verifyCart(harness, prepared.body);
  const held = verdict.decision === "hold";
  const allowed = verdict.decision === "approve";
  const outcome = allowed ? "allowed" : held ? "held" : "blocked";
  return {
    id: scenario.id,
    family: scenario.family,
    description: scenario.description,
    surface: "purchase",
    outcome,
    reasonCode: verdict.reasonCode,
    detector: outcome === "blocked" ? purchaseDetector(verdict) : null,
    remedy: outcome === "blocked" ? remedyOf(verdict.toPass) : null,
    cost: outcome === "blocked" ? purchaseCost(verdict) : null,
    detail: detailOf(scenario, verdict, held),
  };
}

export async function runPurchaseScenarios(
  harness: Harness,
  scenarios: readonly PurchaseScenario[],
  tx: Transcript,
): Promise<readonly ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of scenarios) {
    const result = await runOne(harness, scenario);
    results.push(result);
    tx.result(
      result.id,
      result.outcome !== "blocked",
      `${result.description} -> ${result.outcome}${
        result.reasonCode === null ? "" : ` (${result.reasonCode})`
      }`,
    );
  }
  return results;
}
