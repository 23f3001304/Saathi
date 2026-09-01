/**
 * The wire constants of the gateway contract, **re-derived** rather than
 * imported: `tools/attacks` is black-box HTTP only (dependency-cruiser rule
 * `attacks-are-black-box`), and an attack harness that imported the code it
 * attacks would prove nothing about the code it attacks.
 *
 * Every value here is quoted from `design/backend-architecture.md` §4.2, §6.1
 * and §6.3. A drift between this file and the service is itself a finding, and
 * the harness surfaces it as a failed attack rather than hiding it.
 */

/** §4.2 — pinned, exact match, fail closed. */
export const API_VERSION = "2026-08-31";

export const GATEWAY_AUDIENCE = "urn:covenant:gateway";

/** §6.1 — the pinned AP2 extension URI. T-27 presents a v0.1 of this. */
export const AP2_EXTENSION_URI = "https://covenant.dev/ns/ap2/v1";

/** The URI T-27 downgrades to; no fallback profile exists in the service. */
export const AP2_EXTENSION_URI_V0_1 = "https://covenant.dev/ns/ap2/v0.1";

export const W3C_CREDENTIALS_CONTEXT = "https://www.w3.org/ns/credentials/v2";

export const PINNED_CONTEXT_URIS: readonly string[] = [
  W3C_CREDENTIALS_CONTEXT,
  AP2_EXTENSION_URI,
];

export const MEMORY_DIGEST_ALG = "covenant-md-1";

/** §8.4 check 1 predicate 6 reads this key off `details.modifiers[].data`. */
export const REFUND_POLICY_KEY = "refund_policy";

export const MANDATE_ALG = "ES256";

export const MANDATE_ROLES = ["user", "merchant", "gateway"] as const;

export type MandateRole = (typeof MANDATE_ROLES)[number];

export const MANDATE_KINDS = ["intent", "cart", "payment"] as const;

export type MandateKind = (typeof MANDATE_KINDS)[number];

/** §6.2–§6.4: the `type` array's second member, one per kind. */
export const CREDENTIAL_TYPE_OF: Readonly<Record<MandateKind, string>> = {
  intent: "IntentMandate",
  cart: "CartMandate",
  payment: "PaymentMandate",
};

export const VERIFIABLE_CREDENTIAL = "VerifiableCredential";

/** The eight seals of §8.1, in pipeline order. */
export const CHECK_IDS = [
  "intent_bounds",
  "nonce",
  "uri_pin",
  "risk_data",
  "memory_digest",
  "quote_match",
  "envelope",
  "cooloff",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];
