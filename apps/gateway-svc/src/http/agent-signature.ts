import { createPublicKey, createVerify } from "node:crypto";

import type { KeyResolver, PinnedJwk } from "@covenant/domain";
import { MANDATE_ALG, sha256Hex } from "@covenant/domain";
import type { SignatureBase, SignatureHeader } from "@covenant/gateway";
import { BodySignatureVerifier, baseStringOf } from "@covenant/gateway";

/** The claim the buyer's JWS binds the §4.2 base string through. */
export const ALG_BINDING = "acp/base-string@2026-08-31";

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * The JWS signing input the buyer's signer actually signed:
 * `base64url(header).base64url(payload)`. Neither segment travels in the
 * `Signature` header — only `keyid` and the signature do — so both are
 * reconstructed from values the gateway already has (the kid it was given, and
 * the base string it computed itself). Reconstruction is what makes the check
 * meaningful: if any byte of the request differs, `sig_base` differs and the
 * signature fails.
 */
function signingInputOf(kid: string, base: string): string {
  return `${b64url({ alg: MANDATE_ALG, typ: "JWT", kid })}.${b64url({
    sig_base: sha256Hex(base),
    alg_binding: ALG_BINDING,
  })}`;
}

function publicKeyOf(jwk: PinnedJwk) {
  return createPublicKey({
    key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    format: "jwk",
  });
}

/**
 * DECISION: the transport accepts **two** `Signature` encodings and the
 * reconciliation lives here, in the app, not in either frozen package.
 *
 * §4.2 specifies ES256 over the raw canonical base string, which is what
 * `packages/gateway`'s `BodySignatureVerifier` verifies. `packages/agents`
 * signs through the frozen `MandateSigner` port — which signs *claim sets*,
 * not bytes — so its header carries the signature of a one-claim JWS whose
 * `sig_base` claim is `sha256(BASE)`. Both commit to exactly the same five
 * fields; they differ only in what is hashed before ES256 runs.
 *
 * Adding a raw-bytes signing port to `domain` would touch the package every
 * other package depends on, and rewriting the buyer would touch a frozen lane.
 * Accepting both at the one place that owns the wire format costs a second
 * verification attempt on a failed first, and nothing is weakened: each branch
 * resolves the same pinned kid and each fails closed.
 */
export class AgentAwareSignatureVerifier extends BodySignatureVerifier {
  constructor(private readonly resolver: KeyResolver) {
    super(resolver);
  }

  override verify(
    issuer: string,
    header: SignatureHeader,
    base: SignatureBase,
  ): boolean {
    return (
      super.verify(issuer, header, base) || this.viaJws(issuer, header, base)
    );
  }

  private viaJws(
    issuer: string,
    header: SignatureHeader,
    base: SignatureBase,
  ): boolean {
    const jwk = this.resolver.resolve(issuer, header.keyid);
    if (jwk === null) {
      return false;
    }
    try {
      return createVerify("SHA256")
        .update(signingInputOf(header.keyid, baseStringOf(base)), "utf8")
        .verify(
          { key: publicKeyOf(jwk), dsaEncoding: "ieee-p1363" },
          Buffer.from(header.sig, "base64url"),
        );
    } catch {
      return false;
    }
  }
}
