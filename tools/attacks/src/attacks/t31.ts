import { randomUUID } from "node:crypto";

import { canonicalize } from "../crypto/canonical-json.js";
import type { Prepared } from "../flow/purchase.js";
import { preparePurchase } from "../flow/purchase.js";
import type { VerdictReply } from "../flow/verdict.js";
import { verifyCart } from "../flow/verdict.js";
import { demoBounds, demoCart } from "../fixtures/demo.js";
import type { Harness } from "../harness.js";
import { laneProof, laneSeq } from "../report/ledger.js";
import type { Transcript } from "../report/transcript.js";
import type { AttackResult, AttackStep } from "./result.js";
import { allBlocked } from "./result.js";

const TITLE = "mandate replay";

async function capture(harness: Harness, tx: Transcript, key: string) {
  // Run-unique: envelope spend accumulates per (tenant, user, category), so a
  // second demo run against the same database must start from an empty bucket.
  const category = `t31-${randomUUID().slice(0, 8)}`;
  const prepared = await preparePurchase(harness, {
    userId: `${harness.userIss}#${category}`,
    cart: demoCart({ id: category, category }),
    bounds: demoBounds({ merchantIss: harness.merchantIss, category }),
    description: "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
  });
  const verdict = await verifyCart(harness, prepared.body, key);
  tx.step("A genuine purchase completes. The cart mandate's jti is now burned.");
  tx.detail("cart mandate jti", prepared.cart.jti);
  tx.detail("Idempotency-Key", key);
  tx.detail("decision", verdict.decision);
  tx.detail("txn_id", verdict.txnId ?? "-");
  tx.seals(verdict.seals);
  return { prepared, verdict };
}

async function replay(
  harness: Harness,
  tx: Transcript,
  prepared: Prepared,
): Promise<AttackStep> {
  const verdict = await verifyCart(harness, prepared.body);
  tx.step("THE ATTACK — the same captured mandate, presented again under a fresh key.");
  tx.attempt("POST /v1/verify-cart  same cart_mandate_jwt, new Idempotency-Key");
  tx.detail("HTTP", String(verdict.httpStatus));
  tx.detail("decision", verdict.decision);
  tx.answer(verdict.reasonCode, verdict.human);
  tx.seals(verdict.seals);
  tx.toPass(verdict.toPass);
  const nonceSeal = verdict.seals.find((seal) => seal.check === "nonce");
  const blocked =
    verdict.decision === "reject" &&
    verdict.reasonCode === "NONCE_BURNED" &&
    verdict.seals.length === 8 &&
    nonceSeal?.outcome === "fail";
  if (blocked) {
    tx.blocked("eight seals stamped, the nonce seal is the one that broke");
  } else {
    tx.succeeded(`expected NONCE_BURNED across 8 seals, got ${verdict.reasonCode ?? verdict.decision}`);
  }
  return { label: "replayed mandate", blocked, reasonCode: verdict.reasonCode };
}

async function honestRetry(
  harness: Harness,
  tx: Transcript,
  prepared: Prepared,
  key: string,
  original: VerdictReply,
): Promise<boolean> {
  const retry = await verifyCart(harness, prepared.body, key);
  const identical = canonicalize(retry.reply.body) === canonicalize(original.reply.body);
  tx.step("CONTRAST 1 — same key, identical payload. This is a retry, not an attack.");
  tx.attempt("POST /v1/verify-cart  same cart_mandate_jwt, SAME Idempotency-Key, same body");
  tx.detail("HTTP", String(retry.httpStatus));
  tx.detail("Idempotent-Replay", retry.idempotentReplay ? "true" : "false");
  tx.detail("decision", retry.decision);
  tx.detail("body identical to stored", identical ? "YES — replayed verbatim" : "no");
  tx.note("A retried network request must not look like a replay attack (§4.5).");
  return retry.httpStatus === 200 && retry.idempotentReplay && identical;
}

async function mutatedRetry(
  harness: Harness,
  tx: Transcript,
  prepared: Prepared,
  key: string,
): Promise<boolean> {
  const ids = prepared.body["memory_entry_ids"] as string[];
  const mutated = { ...prepared.body, memory_entry_ids: [...ids, ids[0] ?? ""] };
  const reply = await verifyCart(harness, mutated, key);
  tx.step("CONTRAST 2 — same key, mutated payload. Neither a retry nor a replay.");
  tx.attempt("POST /v1/verify-cart  SAME Idempotency-Key, one extra memory id in the body");
  tx.detail("HTTP", String(reply.httpStatus));
  tx.answer(reply.reasonCode, reply.human);
  tx.toPass(reply.toPass);
  tx.note("Transport idempotency and credential single-use are two mechanisms, and both ship.");
  return reply.httpStatus === 409 && reply.reasonCode === "IDEMPOTENCY_CONFLICT";
}

function notesOf(retryOk: boolean, conflictOk: boolean): readonly string[] {
  return [
    ...(retryOk ? [] : ["the identical retry did not replay verbatim"]),
    ...(conflictOk ? [] : ["the mutated retry did not answer 409"]),
  ];
}

/** §7.3 — a replay is not a retry, a retry is not a replay, a mutation is neither. */
export async function runT31(harness: Harness, tx: Transcript): Promise<AttackResult> {
  tx.banner("T-31", TITLE, "A captured Cart Mandate, presented twice — and the two honest lookalikes.");
  const key = randomUUID();
  tx.section("the capture");
  const captured = await capture(harness, tx, key);
  tx.section("the replay");
  const steps = [await replay(harness, tx, captured.prepared)];
  tx.section("the honest contrast");
  const retryOk = await honestRetry(harness, tx, captured.prepared, key, captured.verdict);
  const conflictOk = await mutatedRetry(harness, tx, captured.prepared, key);
  tx.section("the ledger");
  const lane = await laneProof(harness, tx, "T-31");
  const contrastOk = retryOk && conflictOk;
  const blocked = allBlocked(steps) && lane !== null && contrastOk;
  tx.verdictLine(
    blocked ? "T-31 blocked, and the three-way distinction holds" : "T-31 NOT fully blocked",
    blocked,
  );
  return {
    attackId: "T-31",
    title: TITLE,
    blocked,
    steps,
    ledgerSeq: laneSeq(lane),
    notes: notesOf(retryOk, conflictOk),
  };
}
