import type {
  IdGenerator,
  MandateSigner,
  MandateVerifier,
  Sha256Ref,
} from "@covenant/domain";
import { DomainError, GATEWAY_AUDIENCE, sha256RefOf } from "@covenant/domain";
import { epochSeconds, toJti } from "./mandate-claims.js";
import { hashRef, int, record, str } from "./subject-fields.js";

/**
 * Covenant's extension to AP2's hash set: the user authorises *the beliefs the
 * agent used*, not only an amount and a cart. Without `memory_digest` here, a
 * valid signature over a valid cart still says nothing about the
 * pre-authorisation context (§6.5).
 */
export interface AuthorizedHashes {
  readonly cart_mandate_hash: Sha256Ref;
  readonly payment_mandate_body_hash: Sha256Ref;
  readonly memory_digest: Sha256Ref;
}

export interface UserAuthorizationRequest {
  readonly userIss: string;
  readonly hashes: AuthorizedHashes;
  readonly amount: number;
  readonly currency: string;
  readonly issuedAt: Date;
  readonly ttlSeconds: number;
}

export interface UserAuthorizationExpectation {
  readonly userIss: string;
  readonly hashes: AuthorizedHashes;
  readonly amount: number;
  readonly currency: string;
}

export const USER_AUTHORIZATION_FIELD = "user_authorization";

/**
 * Two-phase, because the payment mandate does not exist until the gateway
 * issues it: draft → the user signs the hash set → the gateway embeds the inner
 * JWT and re-signs the final mandate (§6.5).
 */
export class UserAuthorization {
  constructor(
    private readonly signer: MandateSigner,
    private readonly verifier: MandateVerifier,
    private readonly idGenerator: IdGenerator,
  ) {}

  /** Phase 1: `sha256(canonicalize(credentialSubject minus user_authorization))`. */
  bodyHash(draftSubject: Readonly<Record<string, unknown>>): Sha256Ref {
    const body = { ...draftSubject };
    delete body[USER_AUTHORIZATION_FIELD];
    return sha256RefOf(body);
  }

  /** Phase 3: one hold-to-sign gesture on the signing sheet, with the user key. */
  async issue(request: UserAuthorizationRequest): Promise<string> {
    const iat = epochSeconds(request.issuedAt);
    return this.signer.sign(
      {
        iss: request.userIss,
        sub: request.userIss,
        aud: GATEWAY_AUDIENCE,
        iat,
        exp: iat + request.ttlSeconds,
        jti: toJti(this.idGenerator.uuid()),
        authorized_hashes: request.hashes,
        amount: request.amount,
        currency: request.currency,
      },
      "user",
    );
  }

  /** Phase 4: the gateway will not embed a signature over a different cart. */
  async verify(
    jwt: string,
    expected: UserAuthorizationExpectation,
  ): Promise<AuthorizedHashes> {
    const verified = await this.verifier.verify(jwt, {
      role: "user",
      audience: GATEWAY_AUDIENCE,
      issuer: expected.userIss,
    });
    const claims = verified.claims as Record<string, unknown>;
    const signed = readHashes(record(claims["authorized_hashes"]));
    const bound =
      signed.cart_mandate_hash === expected.hashes.cart_mandate_hash &&
      signed.payment_mandate_body_hash ===
        expected.hashes.payment_mandate_body_hash &&
      signed.memory_digest === expected.hashes.memory_digest &&
      int(claims["amount"]) === expected.amount &&
      str(claims["currency"]) === expected.currency;
    if (!bound) {
      throw new DomainError("MANDATE_MALFORMED");
    }
    return signed;
  }
}

function readHashes(raw: Record<string, unknown>): AuthorizedHashes {
  return {
    cart_mandate_hash: hashRef(raw["cart_mandate_hash"]),
    payment_mandate_body_hash: hashRef(raw["payment_mandate_body_hash"]),
    memory_digest: hashRef(raw["memory_digest"]),
  };
}
