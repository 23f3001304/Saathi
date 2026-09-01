import type { Sha256Hex } from "../hash-ref.js";
import type { MandateRole } from "../trust-role.js";
import type { JwtClaims } from "./mandate-signer.js";

export interface VerifyExpectation {
  readonly role: MandateRole;
  readonly audience: string;
  /** `null` = any pinned issuer holding that role. */
  readonly issuer: string | null;
}

export interface VerifiedJwt {
  readonly claims: JwtClaims;
  readonly kid: string;
  readonly role: MandateRole;
  /** sha256 of the compact JWS — what the next mandate in the chain binds. */
  readonly jwtHash: Sha256Hex;
}

/**
 * Verification is against the pinned trust ring only. Role binding happens
 * here, so a merchant-signed Intent Mandate is `SIGNER_UNKNOWN` and never
 * reaches the policy layer (§6.7 rule 2).
 */
export interface MandateVerifier {
  verify(jwt: string, expected: VerifyExpectation): Promise<VerifiedJwt>;
}
