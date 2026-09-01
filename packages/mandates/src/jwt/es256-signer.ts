import type { JwtClaims, MandateRole, MandateSigner } from "@covenant/domain";
import { DomainError, MANDATE_ALG } from "@covenant/domain";
import { SignJWT, importJWK } from "jose";

import type { KeyStore } from "../keys/key-store.js";

/** Whatever `importJWK` hands back for an EC key — never the symmetric case. */
export type AsymmetricKey = Exclude<
  Awaited<ReturnType<typeof importJWK>>,
  Uint8Array
>;

export async function importAsymmetricJwk(
  jwk: Readonly<Record<string, string>>,
): Promise<AsymmetricKey> {
  const key = await importJWK(jwk, MANDATE_ALG);
  if (key instanceof Uint8Array) {
    throw new DomainError("SIGNER_UNKNOWN");
  }
  return key;
}

/**
 * ES256, role-bound. The claim set arrives fully built — this class adds the
 * header and the signature and nothing else, so `iat`/`exp`/`jti` stay owned by
 * the issuer that has to put them in the ledger too.
 */
export class Es256Signer implements MandateSigner {
  private readonly imported = new Map<MandateRole, AsymmetricKey>();

  constructor(private readonly keyStore: KeyStore) {}

  async sign(claims: JwtClaims, role: MandateRole): Promise<string> {
    const entry = this.keyStore.keyFor(role);
    const key = await this.keyFor(role);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: MANDATE_ALG, typ: "JWT", kid: entry.kid })
      .sign(key);
  }

  private async keyFor(role: MandateRole): Promise<AsymmetricKey> {
    const cached = this.imported.get(role);
    if (cached !== undefined) {
      return cached;
    }
    const key = await importAsymmetricJwk(this.keyStore.keyFor(role).jwk);
    this.imported.set(role, key);
    return key;
  }
}
