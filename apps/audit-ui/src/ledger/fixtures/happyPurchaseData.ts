// §8 demo beat 0:30–1:30 — signed intent, negotiation, six-seal verdict,
// captured payment. The reference scenario every other fixture branches from.
import type {
  CartPayload,
  IntentPayload,
  MemoryEntryPayload,
  VerdictCheckResult,
} from "../types.ts";
import { iso } from "./helpers.ts";

export const HAPPY_TXN_ID = "txn-a91f4c2e";
export const HAPPY_BASE_MS = Date.parse("2026-08-31T08:32:00.000Z");

export const intentBase: IntentPayload = {
  intent_id: "intent-7c2d9b02",
  natural_language_description:
    "A navy kurta under ₹2,000, from a merchant I've bought from before.",
  bounds: {
    max_amount_paise: 200_000,
    merchants: ["acme-grocers", "sundar-textiles", "nilgiri-foods"],
    skus: null,
    requires_refundability: true,
    intent_expiry: iso(HAPPY_BASE_MS, 12 * 60 * 60_000),
  },
  signed_at: null,
  thumbprint: null,
};

export const memory = (
  over: Partial<MemoryEntryPayload>,
): MemoryEntryPayload => ({
  id: "mem-0000",
  type: "fact",
  tier: "P1",
  content: "",
  hash: "0000000000000000",
  source_channel: "catalog",
  t_valid: iso(HAPPY_BASE_MS, -60_000),
  t_invalid: null,
  t_created: iso(HAPPY_BASE_MS, -60_000),
  t_expired: null,
  ...over,
});

export const CHECKS: VerdictCheckResult[] = [
  {
    check: "intent_bounds",
    passed: true,
    human_sentence: "₹1,299.00 is within the signed ₹2,000.00 cap.",
  },
  { check: "nonce", passed: true },
  { check: "uri_pin", passed: true },
  { check: "risk_data", passed: true },
  {
    check: "memory_digest",
    passed: true,
    human_sentence: "Recomputed digest matches the Cart Mandate claim.",
  },
  { check: "quote_match", passed: true },
  {
    check: "envelope",
    passed: true,
    human_sentence: "Your apparel budget has ₹2,701.00 left this month.",
  },
  { check: "cooloff", passed: true },
];

// §2.5 O2 — this is the real sha256 of the four justifying memories' hashes
// below, sorted and concatenated, so the Digest Inspector's client-side
// recomputation genuinely matches on the happy path (verified via
// `node:crypto` at fixture-authoring time, same algorithm DigestInspector runs).
export const cart: CartPayload = {
  cart_id: "cart-4f1a9b02",
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
  memory_digest:
    "7e6ed274ac4195e1f1525447a23db0b2def1ae1d48bcb86c0b1f8967a7ec66d0",
  justified_by: [
    "mem-constraint-cap",
    "mem-pref-sort",
    "mem-quote-a",
    "mem-fact-price",
  ],
};
