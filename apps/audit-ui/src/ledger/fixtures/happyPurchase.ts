// The happy-purchase reel. Its data tables live in happyPurchaseData.ts so
// both files stay inside the 200-line budget; the fixture is unchanged.
// §8 demo beat 0:30–1:30 — signed intent, negotiation, six-seal verdict,
// captured payment. The reference scenario every other fixture branches from.
import type {
  LedgerFrame,
  OutcomePayload,
  RzpCallPayload,
  VerdictPayload,
} from "../types.ts";
import { buildFrames, iso, type FrameInput } from "./helpers.ts";

import {
  HAPPY_BASE_MS,
  HAPPY_TXN_ID,
  cart,
  intentBase,
  memory,
  CHECKS,
} from "./happyPurchaseData.ts";

export const inputs: FrameInput[] = [
  {
    offsetMs: 0,
    actor: "user",
    kind: "intent.drafted",
    txn_id: null,
    payload: intentBase,
  },
  {
    offsetMs: 400,
    actor: "user",
    kind: "intent.signed",
    txn_id: null,
    payload: {
      ...intentBase,
      signed_at: iso(HAPPY_BASE_MS, 400),
      thumbprint: "ES256 · did:key:z6Mk8Qr2f",
    },
  },
  {
    offsetMs: 2000,
    actor: "buyer_agent",
    kind: "memory.retrieved",
    txn_id: HAPPY_TXN_ID,
    payload: memory({
      id: "mem-constraint-cap",
      type: "constraint",
      tier: "P3",
      content: "Never above ₹2,000.00",
      hash: "a91f7c2d9b02c4e1",
    }),
  },
  {
    offsetMs: 2500,
    actor: "buyer_agent",
    kind: "memory.retrieved",
    txn_id: HAPPY_TXN_ID,
    payload: memory({
      id: "mem-pref-sort",
      type: "preference",
      tier: "P3",
      content: "Sort by total landed cost, ascending",
      hash: "7c2d9b02a91f4c2e",
    }),
  },
  {
    offsetMs: 3000,
    actor: "merchant_agent",
    kind: "catalog.quote.received",
    txn_id: HAPPY_TXN_ID,
    payload: memory({
      id: "mem-quote-a",
      type: "fact",
      tier: "P2",
      content: "sundar-textiles quotes ₹1,299.00, ships in 1d",
      hash: "9b02c4e1a91f7c2d",
    }),
  },
  {
    offsetMs: 3400,
    actor: "buyer_agent",
    kind: "memory.retrieved",
    txn_id: HAPPY_TXN_ID,
    payload: memory({
      id: "mem-fact-price",
      type: "fact",
      tier: "P1",
      content: "₹1,299 for 30 of the last 34 days",
      hash: "c4e1a91f7c2d9b02",
    }),
  },
  {
    offsetMs: 9000,
    actor: "buyer_agent",
    kind: "cart.assembled",
    txn_id: HAPPY_TXN_ID,
    payload: cart,
  },
  {
    offsetMs: 9200,
    actor: "gateway",
    kind: "cart.digest.computed",
    txn_id: HAPPY_TXN_ID,
    payload: cart,
  },
  {
    offsetMs: 9800,
    actor: "gateway",
    kind: "verdict.emitted",
    txn_id: HAPPY_TXN_ID,
    payload: {
      txn_id: HAPPY_TXN_ID,
      checks: CHECKS,
      latency_ms: 64,
    } satisfies VerdictPayload,
  },
  {
    offsetMs: 10200,
    actor: "razorpay",
    kind: "rzp.order.created",
    txn_id: HAPPY_TXN_ID,
    payload: {
      call: "order.created",
      id: "order_Qh8k2f",
      idempotency_key: "jti-7c2d9b02",
      agent_present: true,
    } satisfies RzpCallPayload,
  },
  {
    offsetMs: 10500,
    actor: "razorpay",
    kind: "rzp.link.created",
    txn_id: HAPPY_TXN_ID,
    payload: {
      call: "link.created",
      id: "plink_Qh8k2f",
      idempotency_key: "jti-7c2d9b02",
      agent_present: true,
    } satisfies RzpCallPayload,
  },
  {
    offsetMs: 11000,
    actor: "razorpay",
    kind: "rzp.polled",
    txn_id: HAPPY_TXN_ID,
    payload: {
      call: "polled",
      id: "plink_Qh8k2f",
      idempotency_key: "jti-7c2d9b02",
      agent_present: true,
    } satisfies RzpCallPayload,
  },
  {
    offsetMs: 12600,
    actor: "razorpay",
    kind: "payment.captured",
    txn_id: HAPPY_TXN_ID,
    payload: {
      status: "captured",
      amount_paise: 129_900,
      captured_at: iso(HAPPY_BASE_MS, 12_600),
    } satisfies OutcomePayload,
  },
];

export function happyPurchaseFrames(): LedgerFrame[] {
  return buildFrames(HAPPY_BASE_MS, inputs);
}

export { HAPPY_TXN_ID, HAPPY_BASE_MS } from "./happyPurchaseData.ts";
