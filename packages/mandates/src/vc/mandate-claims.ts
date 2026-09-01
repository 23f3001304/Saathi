import type { MandateKind } from "@covenant/domain";

/** The `type` array's second member, one per mandate kind (§6.2–§6.4). */
export const CREDENTIAL_TYPE_OF: Readonly<Record<MandateKind, string>> = {
  intent: "IntentMandate",
  cart: "CartMandate",
  payment: "PaymentMandate",
};

export const VERIFIABLE_CREDENTIAL = "VerifiableCredential";

/**
 * Which registered/VC members each kind carries, verbatim from §6.2–§6.4. The
 * Payment Mandate has no `nbf` and only the Intent Mandate carries `validFrom`
 * — a golden-vector test pins this so downstream decoders can rely on it.
 */
export const ENVELOPE_SHAPE: Readonly<
  Record<MandateKind, { readonly nbf: boolean; readonly validFrom: boolean }>
> = {
  intent: { nbf: true, validFrom: true },
  cart: { nbf: true, validFrom: false },
  payment: { nbf: false, validFrom: false },
};

export interface VerifiableCredentialClaim {
  readonly "@context": readonly string[];
  readonly type: readonly string[];
  readonly issuer: string;
  readonly validFrom?: string;
  readonly credentialSubject: Readonly<Record<string, unknown>>;
}

/** Registered JWT claims carry identity and lifetime; `vc` carries the credential. */
export interface MandateJwtPayload {
  readonly iss: string;
  readonly sub: string;
  readonly aud: string;
  readonly iat: number;
  readonly nbf?: number;
  readonly exp: number;
  readonly jti: string;
  readonly vc: VerifiableCredentialClaim;
}

export const JTI_PREFIX = "urn:uuid:";

export function toJti(uuid: string): string {
  return `${JTI_PREFIX}${uuid}`;
}

const JTI_PATTERN =
  /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** The `jti` IS the nonce (§6.1), so its shape is checked, not assumed. */
export function isJti(value: string): boolean {
  return JTI_PATTERN.test(value);
}

export function epochSeconds(instant: Date): number {
  return Math.floor(instant.getTime() / 1000);
}
