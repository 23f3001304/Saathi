import type { MandateRole } from "../trust-role.js";

export type JwtClaims = Readonly<Record<string, unknown>>;

/** Compact JWS, ES256, signed with the key bound to that role (§6.7). */
export interface MandateSigner {
  sign(claims: JwtClaims, role: MandateRole): Promise<string>;
}
