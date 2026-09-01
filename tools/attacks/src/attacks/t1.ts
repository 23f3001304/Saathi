import { randomUUID } from "node:crypto";

import type { WriteSpec } from "../flow/memory.js";
import { retrieveMemory, writeMemory } from "../flow/memory.js";
import { preparePurchase } from "../flow/purchase.js";
import { verifyCart } from "../flow/verdict.js";
import { demoBounds, demoCart } from "../fixtures/demo.js";
import type { Harness } from "../harness.js";
import { issueIntent } from "../mandates/intent-mandate.js";
import { laneProof, laneSeq } from "../report/ledger.js";
import type { Transcript } from "../report/transcript.js";
import type { AttackResult, AttackStep } from "./result.js";
import { allBlocked } from "./result.js";
import * as poison from "./t1-payloads.js";

const TITLE = "pre-signing context poisoning";

async function signCovenant(harness: Harness, tx: Transcript) {
  const intent = issueIntent(harness.ring, {
    tenantId: harness.tenantId,
    description: "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
    agentInstanceId: harness.agentUrn,
    bounds: demoBounds({ merchantIss: harness.merchantIss, category: "t1-footwear" }),
    issuedAt: new Date(),
  });
  const reply = await harness.client.post("/v1/covenant/sign", {
    intent_mandate_jwt: intent.jwt,
    tenant_id: harness.tenantId,
  });
  const committed = (reply.body["committed_constraints"] ?? []) as string[];
  tx.step("The user signs the covenant. Every bound becomes a P3 constraint.");
  tx.detail("cap signed", "INR 2,000.00 (200000 paise)");
  tx.detail("constraints committed", String(committed.length));
  tx.detail("ledger event_id", String(reply.body["event_id"] ?? "(none)"));
  await writeMemory(
    harness,
    poison.normalisedCap(harness.userIss, intent.jwt, intent.jti),
  );
  tx.note("plus one normalised `max_amount` constraint — see the DECISION in t1-payloads.ts");
  return intent;
}

async function gate(
  harness: Harness,
  tx: Transcript,
  label: string,
  spec: WriteSpec,
  expected: string,
): Promise<AttackStep> {
  const result = await writeMemory(harness, spec);
  tx.step(label);
  tx.attempt(
    `POST /v1/memory/write  type=${spec.type} tier_claim=${spec.tierClaim} channel=${spec.channel}`,
  );
  tx.detail("status", result.status);
  tx.detail("rule", result.rule ?? "(stage 1, before the chain)");
  tx.answer(result.reasonCode, result.human);
  tx.toPass(result.reply.body["to_pass"]);
  tx.detail("ledger event_id", result.eventId ?? "(none)");
  const blocked = result.status === "rejected" && result.reasonCode === expected;
  if (blocked) {
    tx.blocked(`write refused with ${expected}`);
  } else {
    tx.succeeded(`expected ${expected}, got ${result.reasonCode ?? result.status}`);
  }
  return { label, blocked, reasonCode: result.reasonCode };
}

async function proveQuarantine(harness: Harness, tx: Transcript): Promise<void> {
  const nonce = randomUUID().slice(0, 8);
  const stored = await writeMemory(harness, poison.ordinaryCatalogCopy(harness.userIss, nonce));
  tx.step("The same merchant's ordinary copy is accepted — at P0, quarantined.");
  tx.detail("status", stored.status);
  tx.detail("tier_granted", stored.tierGranted ?? "(none)");
  tx.detail("memory_id", stored.memoryId ?? "(none)");
  const cart = await retrieveMemory(harness, harness.userIss, "cart-construction", "shoe colour");
  const chat = await retrieveMemory(harness, harness.userIss, "chat", "shoe colour");
  const inCart = stored.memoryId !== null && cart.entryIds.includes(stored.memoryId);
  tx.detail("visible to cart-construction", inCart ? "YES" : "no");
  tx.detail("visible to chat", chat.entryIds.includes(stored.memoryId ?? "") ? "yes (flagged)" : "no");
  tx.note("Untrusted text is stored so the audit lane can show it, and excluded from every action class but chat.");
}

async function proveBounded(harness: Harness, tx: Transcript): Promise<AttackStep> {
  // A run-unique envelope category: spend accumulates per (tenant, user,
  // category), so a re-run must not inherit the previous run's burn-down.
  const category = `t1-over-${randomUUID().slice(0, 8)}`;
  const over = await preparePurchase(harness, {
    userId: harness.userIss,
    cart: demoCart({ id: category, category, unitPaise: poison.POISON_AMOUNT_PAISE }),
    bounds: demoBounds({
      merchantIss: harness.merchantIss,
      category,
      capPaise: 100_000_000,
      cooloffThresholdPaise: 100_000_000,
    }),
    description: "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
  });
  const verdict = await verifyCart(harness, over.body);
  tx.step("The cart the poison tried to authorise is presented anyway.");
  tx.attempt("POST /v1/verify-cart with a INR 50,000.00 cart under the same signed intent");
  tx.detail("decision", verdict.decision);
  tx.answer(verdict.reasonCode, verdict.human);
  tx.seals(verdict.seals);
  const blocked = verdict.decision === "reject" && verdict.reasonCode === "CART_EXCEEDS_INTENT_CAP";
  if (blocked) {
    tx.blocked("the signed cap still binds — catalog text can never raise a bound");
  } else {
    tx.succeeded(`expected CART_EXCEEDS_INTENT_CAP, got ${verdict.reasonCode ?? verdict.decision}`);
  }
  return { label: "poisoned amount still refused", blocked, reasonCode: verdict.reasonCode };
}

async function proveHonestPurchaseStillWorks(harness: Harness, tx: Transcript): Promise<boolean> {
  const category = `t1-ok-${randomUUID().slice(0, 8)}`;
  const honest = await preparePurchase(harness, {
    userId: harness.userIss,
    cart: demoCart({ id: category, category }),
    bounds: demoBounds({ merchantIss: harness.merchantIss, category }),
    description: "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
  });
  const verdict = await verifyCart(harness, honest.body);
  tx.step("And the honest INR 1,899.00 cart still goes through.");
  tx.detail("decision", verdict.decision);
  tx.seals(verdict.seals);
  tx.note("The defence costs the user nothing: the purchase they actually asked for completes.");
  return verdict.decision === "approve";
}

function notesOf(honest: boolean): readonly string[] {
  return honest ? [] : ["the honest purchase did not approve"];
}

/** §7.2 — three independent gates reject the same payload. */
export async function runT1(harness: Harness, tx: Transcript): Promise<AttackResult> {
  tx.banner("T-1", TITLE, "A merchant catalog description carrying an injected authority claim.");
  tx.section("the covenant");
  await signCovenant(harness, tx);
  tx.section("the poisoned catalog line");
  tx.raw(`\n     "${poison.POISON}"\n`);
  const steps = [
    await gate(harness, tx, "Gate 1 — channel to tier.", poison.inflatedTierClaim(harness.userIss), "TIER_CLAIM_EXCEEDS_CHANNEL"),
    await gate(harness, tx, "Gate 2 — type permission.", poison.poisonedConstraint(harness.userIss), "TYPE_REQUIRES_HIGHER_TIER"),
    await gate(harness, tx, "Gate 3a — R3, against the covenant's own constraint.", poison.protectedBooleanFlip(harness.userIss), "PROTECTED_BOOLEAN_FLIP"),
    await gate(harness, tx, "Gate 3b — R1, the numeric widening.", poison.numericRelaxation(harness.userIss), "CONSTRAINT_RELAXATION_ATTEMPT"),
  ];
  tx.section("what was stored, and what was not");
  await proveQuarantine(harness, tx);
  tx.section("the cart is still bounded");
  steps.push(await proveBounded(harness, tx));
  const honest = await proveHonestPurchaseStillWorks(harness, tx);
  tx.section("the ledger");
  const lane = await laneProof(harness, tx, "T-1");
  const blocked = allBlocked(steps) && lane !== null && honest;
  tx.verdictLine(blocked ? "T-1 blocked, labelled and ledgered" : "T-1 NOT fully blocked", blocked);
  return {
    attackId: "T-1",
    title: TITLE,
    blocked,
    steps,
    ledgerSeq: laneSeq(lane),
    notes: notesOf(honest),
  };
}
