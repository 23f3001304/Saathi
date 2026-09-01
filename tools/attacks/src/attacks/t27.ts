import { randomUUID } from "node:crypto";

import { mintJti } from "../crypto/jws.js";
import type { PurchaseSpec } from "../flow/purchase.js";
import { preparePurchase } from "../flow/purchase.js";
import { verifyCart } from "../flow/verdict.js";
import { DEMO_UNIT_PAISE, demoBounds, demoCart } from "../fixtures/demo.js";
import type { Harness } from "../harness.js";
import { AP2_EXTENSION_URI, AP2_EXTENSION_URI_V0_1 } from "../protocol.js";
import { laneProof, laneSeq } from "../report/ledger.js";
import type { Transcript } from "../report/transcript.js";
import type { AttackResult, AttackStep } from "./result.js";
import { allBlocked } from "./result.js";

const TITLE = "AP2 extension-URI downgrade";

/**
 * The envelope cap is exactly one cart total, so a single reservation would
 * exhaust it. That is the whole proof of "nothing reserved": if the rejected
 * presentation had taken capacity, the corrected cart could not fit.
 */
function specOf(harness: Harness, userId: string, jti: string, category: string): PurchaseSpec {
  return {
    userId,
    cartJti: jti,
    cart: demoCart({ id: `t27-${Date.now()}`, category }),
    bounds: demoBounds({
      merchantIss: harness.merchantIss,
      category,
      capPaise: DEMO_UNIT_PAISE,
    }),
    description: "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
  };
}

async function downgrade(
  harness: Harness,
  tx: Transcript,
  spec: PurchaseSpec,
): Promise<AttackStep> {
  const prepared = await preparePurchase(harness, {
    ...spec,
    extensionUri: AP2_EXTENSION_URI_V0_1,
  });
  const verdict = await verifyCart(harness, prepared.body);
  tx.step("THE ATTACK — a genuinely merchant-signed cart advertising the v0.1 profile.");
  tx.attempt(`ap2_extension_uri = ${AP2_EXTENSION_URI_V0_1}`);
  tx.detail("expected", AP2_EXTENSION_URI);
  tx.detail("signature", "valid ES256, merchant kid from the pinned ring");
  tx.detail("HTTP", String(verdict.httpStatus));
  tx.detail("decision", verdict.decision);
  tx.answer(verdict.reasonCode, verdict.human);
  tx.seals(verdict.seals);
  tx.toPass(verdict.toPass);
  const blocked =
    verdict.httpStatus === 200 &&
    verdict.decision === "reject" &&
    verdict.reasonCode === "URI_DOWNGRADE" &&
    verdict.seals.length === 0;
  if (blocked) {
    tx.blocked("stage 0 refused the credential — the pipeline never ran, so no seal is claimed");
  } else {
    tx.succeeded(
      `expected a zero-seal URI_DOWNGRADE, got ${verdict.reasonCode ?? verdict.decision} across ${verdict.seals.length} seals`,
    );
  }
  tx.note("There is no fallback profile in the codebase. Unknown and older are the same answer.");
  return { label: "v0.1 extension URI", blocked, reasonCode: verdict.reasonCode };
}

async function proveNothingConsumed(
  harness: Harness,
  tx: Transcript,
  spec: PurchaseSpec,
): Promise<AttackStep> {
  const prepared = await preparePurchase(harness, spec);
  const verdict = await verifyCart(harness, prepared.body);
  tx.step("Nothing was burned and nothing was reserved.");
  tx.attempt(
    "the merchant upgrades and re-presents THE SAME jti, into an envelope with room for exactly one cart",
  );
  tx.detail("cart mandate jti", prepared.cart.jti);
  tx.detail("envelope cap", "INR 1,899.00 — one cart, no slack");
  tx.detail("decision", verdict.decision);
  tx.seals(verdict.seals);
  const clean = verdict.decision === "approve";
  if (clean) {
    tx.blocked("nonce unburned and envelope untouched: a fail-closed rejection costs the merchant nothing but the fix");
  } else {
    tx.succeeded(`the rejected presentation consumed state: ${verdict.reasonCode ?? verdict.decision}`);
  }
  return { label: "nothing burned or reserved", blocked: clean, reasonCode: verdict.reasonCode };
}

/** §7.4 — fail closed, and pay the availability cost on purpose. */
export async function runT27(harness: Harness, tx: Transcript): Promise<AttackResult> {
  tx.banner("T-27", TITLE, "A merchant speaking an older protocol version cannot sell. That is the correct trade.");
  const userId = `${harness.userIss}#t27-${randomUUID()}`;
  const jti = mintJti();
  const category = `t27-${randomUUID().slice(0, 8)}`;
  tx.section("the downgrade");
  const steps = [await downgrade(harness, tx, specOf(harness, userId, jti, category))];
  tx.section("what it cost");
  steps.push(await proveNothingConsumed(harness, tx, specOf(harness, userId, jti, category)));
  tx.section("the ledger");
  const lane = await laneProof(harness, tx, "T-27");
  const blocked = allBlocked(steps) && lane !== null;
  tx.verdictLine(blocked ? "T-27 blocked fail-closed, nothing consumed" : "T-27 NOT fully blocked", blocked);
  return { attackId: "T-27", title: TITLE, blocked, steps, ledgerSeq: laneSeq(lane), notes: [] };
}
