import { createPublicKey, createVerify } from "node:crypto";

import type { KeyResolver, PinnedJwk } from "@covenant/domain";
import { MANDATE_ALG, sha256Hex } from "@covenant/domain";

export interface SignatureHeader {
  readonly keyid: string;
  readonly alg: string;
  readonly sig: string;
}

export interface SignatureBase {
  readonly method: string;
  /** No query string: the path is part of what the signature binds. */
  readonly path: string;
  readonly timestamp: string;
  readonly idempotencyKey: string;
  readonly rawBody: string;
}

/**
 * DECISION (§4.2): the agent signs a canonical base string, not the bare body.
 * A body-only signature is portable across paths and time, so a captured
 * `verify-cart` body could be replayed at `execute-payment`. Binding method,
 * path, timestamp and idempotency key costs nothing and closes it.
 */
export function baseStringOf(base: SignatureBase): string {
  return [
    base.method,
    base.path,
    base.timestamp,
    base.idempotencyKey,
    sha256Hex(base.rawBody),
  ].join("\n");
}

const HEADER_PATTERN = /^keyid=([^,]+),alg=([^,]+),sig=([A-Za-z0-9_-]+)$/;

export function parseSignatureHeader(header: string): SignatureHeader | null {
  const parsed = HEADER_PATTERN.exec(header.trim());
  if (parsed === null) {
    return null;
  }
  const [, keyid = "", alg = "", sig = ""] = parsed;
  // `alg` is pinned here; `none` never reaches a verifier.
  return alg === MANDATE_ALG ? { keyid, alg, sig } : null;
}

/**
 * Verifies the ACP `Signature` header against a **pinned** JWK. Resolution is
 * file-only — no `jku`, no `x5u`, no DID resolution, no network — so an unknown
 * kid is a rejection rather than a fetch.
 *
 * `ieee-p1363` is the JWS raw `r || s` encoding; Node defaults to DER, and
 * accepting either would be an algorithm-agile path an attacker could steer.
 * Synchronous on purpose: admission runs on the same thread as the transaction
 * that follows it (§5.3).
 */
export class BodySignatureVerifier {
  constructor(private readonly keys: KeyResolver) {}

  verify(
    issuer: string,
    header: SignatureHeader,
    base: SignatureBase,
  ): boolean {
    const jwk = this.keys.resolve(issuer, header.keyid);
    if (jwk === null) {
      return false;
    }
    try {
      return createVerify("SHA256")
        .update(baseStringOf(base), "utf8")
        .verify(
          { key: publicKeyOf(jwk), dsaEncoding: "ieee-p1363" },
          Buffer.from(header.sig, "base64url"),
        );
    } catch {
      return false;
    }
  }
}

function publicKeyOf(jwk: PinnedJwk) {
  return createPublicKey({
    key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
    format: "jwk",
  });
}
