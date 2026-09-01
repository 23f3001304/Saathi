import type { IsoTimestamp } from "../iso-timestamp.js";
import type { MandateRole } from "../trust-role.js";

/** A public JWK from the committed trust ring (§6.7). */
export interface PinnedJwk {
  readonly kid: string;
  readonly kty: string;
  readonly crv: string;
  readonly alg: string;
  readonly x: string;
  readonly y: string;
  readonly use: string;
  readonly role: MandateRole;
  /** A kid past `not_after` verifies nothing. */
  readonly not_after: IsoTimestamp;
}

/**
 * `(iss, kid) → JWK` from the pinned file only: no `jku`, no `x5u`, no DID
 * resolution, no network. Unknown means `SIGNER_UNKNOWN` — fail closed.
 */
export interface KeyResolver {
  resolve(iss: string, kid: string): PinnedJwk | null;
}
