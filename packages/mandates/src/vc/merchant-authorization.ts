import type {
  IdGenerator,
  MandateSigner,
  MandateVerifier,
  Sha256Ref,
} from "@covenant/domain";
import { DomainError, GATEWAY_AUDIENCE } from "@covenant/domain";

import { epochSeconds, toJti } from "./mandate-claims.js";
import { hashRef, str } from "./subject-fields.js";

export interface MerchantAuthorizationRequest {
  readonly merchantIss: string;
  readonly cartId: string;
  readonly cartHash: Sha256Ref;
  readonly issuedAt: Date;
  readonly ttlSeconds: number;
}

export interface MerchantAuthorizationExpectation {
  readonly merchantIss: string;
  readonly cartId: string;
  readonly cartHash: Sha256Ref;
}

/**
 * The inner AP2 cart signature (§6.6) — exactly A.2's claim set, no `vc`. It is
 * a second, independent statement over the same `cart_hash`, which is what lets
 * `QuoteMatchCheck` demand that three values agree rather than two.
 */
export class MerchantAuthorization {
  constructor(
    private readonly signer: MandateSigner,
    private readonly verifier: MandateVerifier,
    private readonly idGenerator: IdGenerator,
  ) {}

  async issue(request: MerchantAuthorizationRequest): Promise<string> {
    const iat = epochSeconds(request.issuedAt);
    return this.signer.sign(
      {
        iss: request.merchantIss,
        sub: request.cartId,
        aud: GATEWAY_AUDIENCE,
        iat,
        exp: iat + request.ttlSeconds,
        jti: toJti(this.idGenerator.uuid()),
        cart_hash: request.cartHash,
      },
      "merchant",
    );
  }

  /** Any disagreement over `cart_hash` is `CART_HASH_MISMATCH` (§6.6). */
  async verify(
    jwt: string,
    expected: MerchantAuthorizationExpectation,
  ): Promise<Sha256Ref> {
    const verified = await this.verifier.verify(jwt, {
      role: "merchant",
      audience: GATEWAY_AUDIENCE,
      issuer: expected.merchantIss,
    });
    const claims = verified.claims as Record<string, unknown>;
    const signedHash = hashRef(claims["cart_hash"]);
    if (
      str(claims["sub"]) !== expected.cartId ||
      signedHash !== expected.cartHash
    ) {
      throw new DomainError("CART_HASH_MISMATCH");
    }
    return signedHash;
  }
}
