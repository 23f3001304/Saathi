import type { WriteSpec } from "../flow/memory.js";
import { DEMO_SKU } from "../fixtures/demo.js";
import type { MemoryScenario, ScenarioContext } from "./types.js";

const PRICES = "merchant price attestation (P2)";

const FACTS = "ordinary agent memory (P1/P2)";

function attested(
  context: ScenarioContext,
  predicate: string,
  content: Readonly<Record<string, unknown>>,
): WriteSpec {
  return {
    type: "fact",
    tierClaim: "P2",
    content,
    channel: "merchant_attestation",
    sourceRef: context.merchantJti,
    sig: context.merchantSig,
    subject: DEMO_SKU,
    predicate,
    userId: context.userId,
  };
}

function quote(context: ScenarioContext, totalPaise: number, ttlMs: number) {
  return attested(context, "price", {
    quote_jti: `urn:uuid:${context.merchantJti.slice(9)}`,
    sku_id: DEMO_SKU,
    total_paise: totalPaise,
    quote_expiry: new Date(Date.now() + ttlMs).toISOString(),
    reservation_id: `rsv_${context.merchantJti.slice(-10)}`,
  });
}

function verified(
  context: ScenarioContext,
  type: WriteSpec["type"],
  predicate: string,
  content: Readonly<Record<string, unknown>>,
): WriteSpec {
  return {
    type,
    tierClaim: "P1",
    content,
    channel: "verified_api",
    sourceRef: "catalog-api",
    sig: null,
    subject: DEMO_SKU,
    predicate,
    userId: context.userId,
  };
}

/** Legitimate price movement and ordinary agent memory: nothing adversarial. */
export const ATTESTED_SCENARIOS: readonly MemoryScenario[] = [
  {
    id: "B01",
    family: PRICES,
    description: "a first price attestation for the SKU",
    write: (context) => quote(context, 189_900, 3_600_000),
  },
  {
    id: "B02",
    family: PRICES,
    description: "a price drop, re-attested by the same merchant",
    seeds: [(context) => quote(context, 189_900, 3_600_000)],
    write: (context) => quote(context, 169_900, 3_600_000),
  },
  {
    id: "B03",
    family: PRICES,
    description: "a price rise that is still inside the signed cap",
    seeds: [(context) => quote(context, 169_900, 3_600_000)],
    write: (context) => quote(context, 199_900, 3_600_000),
  },
  {
    id: "B04",
    family: PRICES,
    description: "a re-quote after the previous quote's TTL expired",
    seeds: [(context) => quote(context, 189_900, -1_000)],
    write: (context) => quote(context, 189_900, 3_600_000),
  },
  {
    id: "B05",
    family: PRICES,
    description: "an attestation whose note says 'authorized reseller, up to 20% off'",
    write: (context) =>
      attested(context, "promotion", {
        value: "Authorized reseller, up to 20% off through Sunday.",
      }),
  },
  {
    id: "D01",
    family: FACTS,
    description: "the user's shoe size from a verified catalog API",
    write: (context) => verified(context, "fact", "size", { shoe_size_uk: 8 }),
  },
  {
    id: "D02",
    family: FACTS,
    description: "a preference for cushioned soles",
    write: (context) => verified(context, "preference", "sole", { value: "cushioned" }),
  },
  {
    id: "D03",
    family: FACTS,
    description: "a learned merchant checkout procedure",
    write: (context) => ({
      ...attested(context, "checkout_flow", { steps: ["cart", "address", "pay"] }),
      type: "procedure",
    }),
  },
  {
    id: "D04",
    family: FACTS,
    description: "a foot measurement carrying a unit no constraint bounds",
    write: (context) =>
      verified(context, "fact", "foot_length", { value: 26.5, unit: "cm" }),
  },
  {
    id: "D05",
    family: FACTS,
    description: "a merchant-attested refund window of 30 days",
    write: (context) =>
      attested(context, "refund_policy_days", { value: 30, unit: "days" }),
  },
  {
    id: "D06",
    family: FACTS,
    description: "a chat transcript stored as an episode from untrusted text",
    write: (context) => ({
      type: "episode",
      tierClaim: "P0",
      content: { turn: "I want the blue ones in UK 8, under two thousand." },
      channel: "untrusted_text",
      sourceRef: "chat",
      sig: null,
      subject: "session",
      predicate: "transcript",
      userId: context.userId,
    }),
  },
];
