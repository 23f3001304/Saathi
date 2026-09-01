/**
 * Three keypairs, three independent trust contexts (§6.7). Role binding is
 * checked before policy: a merchant-signed Intent Mandate is `SIGNER_UNKNOWN`,
 * never a bounds failure.
 */
export const MANDATE_ROLES = ["user", "merchant", "gateway"] as const;

export type MandateRole = (typeof MANDATE_ROLES)[number];

/** `<role>-<yyyy-mm>-<8 hex>`, e.g. `merchant-2026-08-3f9a1c40` (§6.1). */
const KID_PATTERN = /^(user|merchant|gateway)-\d{4}-\d{2}-[0-9a-f]{8}$/;

export function isKid(value: string): boolean {
  return KID_PATTERN.test(value);
}

export function roleOfKid(kid: string): MandateRole | null {
  const parsed = KID_PATTERN.exec(kid);
  return parsed === null ? null : (parsed[1] as MandateRole);
}

/** ES256 only; `alg` is pinned and `none` is rejected before jose is called. */
export const MANDATE_ALG = "ES256";

/** Identifiers are `urn:covenant:*` URNs, not `did:key` (decision 31). */
export const GATEWAY_ISSUER = "urn:covenant:gateway";

export const GATEWAY_AUDIENCE = "urn:covenant:gateway";

export const EXECUTOR_AUDIENCE = "urn:covenant:gateway:executor";

/** Pinned, exact match, fail closed — AM4 / T-27 (§6.1). */
export const AP2_EXTENSION_URI = "https://covenant.dev/ns/ap2/v1";

export const W3C_CREDENTIALS_CONTEXT = "https://www.w3.org/ns/credentials/v2";

export const PINNED_CONTEXT_URIS: readonly string[] = [
  W3C_CREDENTIALS_CONTEXT,
  AP2_EXTENSION_URI,
];

/** ±120 s on `nbf`/`iat`; `exp` is hard (§6.1). */
export const CLOCK_SKEW_SECONDS = 120;
