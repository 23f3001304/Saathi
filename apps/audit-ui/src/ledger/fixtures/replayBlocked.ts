// §8 beat 2:30–2:45 (T-31) — a burned Cart Mandate `jti` presented again.
// `NonceCheck` fails; the verdict's thread knot breaks the chain.
import type {
  CartPayload,
  LedgerFrame,
  OutcomePayload,
  VerdictCheckResult,
  VerdictPayload,
} from "../types.ts";
import { buildFrames, type FrameInput } from "./helpers.ts";

export const REPLAY_TXN_ID = "txn-nonce9c1e";
export const REPLAY_BASE_MS = Date.parse("2026-08-31T08:45:30.000Z");

const cart: CartPayload = {
  cart_id: "cart-9c1e77ab",
  items: [
    {
      sku: "sundar-kurta-navy",
      title: "Navy Kurta",
      quantity: 1,
      unit_price_paise: 129_900,
      merchant: "sundar-textiles",
    },
  ],
  total_paise: 129_900,
  quote_signature_valid: true,
  memory_digest: "9c1e77ab",
  justified_by: ["mem-constraint-cap"],
};

const CHECKS: VerdictCheckResult[] = [
  { check: "intent_bounds", passed: true },
  {
    check: "nonce",
    passed: false,
    reason_code: "NONCE_BURNED",
    human_sentence:
      "This purchase was already paid for once. Paying again was refused.",
    to_pass: { required: "a freshly issued jti" },
  },
  { check: "uri_pin", passed: true },
  { check: "risk_data", passed: true },
  { check: "memory_digest", passed: true },
  { check: "quote_match", passed: true },
  { check: "envelope", passed: true },
  { check: "cooloff", passed: true },
];

const inputs: FrameInput[] = [
  {
    offsetMs: 0,
    actor: "buyer_agent",
    kind: "cart.assembled",
    txn_id: REPLAY_TXN_ID,
    payload: cart,
  },
  {
    offsetMs: 400,
    actor: "gateway",
    kind: "verdict.emitted",
    txn_id: REPLAY_TXN_ID,
    payload: {
      txn_id: REPLAY_TXN_ID,
      checks: CHECKS,
      latency_ms: 41,
    } satisfies VerdictPayload,
  },
  {
    offsetMs: 620,
    actor: "gateway",
    kind: "attack.detected",
    txn_id: REPLAY_TXN_ID,
    payload: {
      attack_id: "T-31",
      reason_code: "NONCE_BURNED",
      human: "The same purchase was sent twice. The second one was refused.",
      detail_kind: "verdict.emitted",
    },
  },
  {
    offsetMs: 800,
    actor: "gateway",
    kind: "payment.failed",
    txn_id: REPLAY_TXN_ID,
    payload: {
      status: "failed",
      amount_paise: 129_900,
      captured_at: null,
    } satisfies OutcomePayload,
  },
];

export function replayBlockedFrames(): LedgerFrame[] {
  return buildFrames(REPLAY_BASE_MS, inputs);
}
