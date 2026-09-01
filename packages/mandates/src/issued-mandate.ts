import type { MandateRole, MandateSigner, Sha256Hex } from "@covenant/domain";
import { sha256Hex } from "@covenant/domain";
import type { MandateJwtPayload } from "./vc/mandate-claims.js";

/**
 * What an issuer hands back. `jwtHash` is computed here rather than by the
 * caller so that the value the next mandate binds is always the hash of the
 * exact bytes that were signed.
 */
export interface IssuedMandate {
  readonly jwt: string;
  readonly jti: string;
  readonly jwtHash: Sha256Hex;
  readonly payload: MandateJwtPayload;
}

export async function signMandate(
  signer: MandateSigner,
  payload: MandateJwtPayload,
  role: MandateRole,
): Promise<IssuedMandate> {
  const jwt = await signer.sign({ ...payload }, role);
  return { jwt, jti: payload.jti, jwtHash: sha256Hex(jwt), payload };
}
