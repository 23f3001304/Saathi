import type {
  Clock,
  KeyResolver,
  MandateVerifier,
  PinnedJwk,
  VerifiedJwt,
  VerifyExpectation,
} from "@covenant/domain";
import {
  CLOCK_SKEW_SECONDS,
  DomainError,
  MANDATE_ALG,
  sha256Hex,
} from "@covenant/domain";
import { jwtVerify } from "jose";

import { readProtectedHeader, readUnverifiedIssuer } from "./compact-jws.js";
import { importAsymmetricJwk } from "./es256-signer.js";
import { toDomainError } from "./verify-errors.js";

const REQUIRED_CLAIMS = ["iss", "sub", "aud", "iat", "exp", "jti"];

/**
 * Signature, `alg` pin, role binding and lifetime — in that order, all against
 * the pinned trust ring. Role binding happens *here*, so a merchant-signed
 * Intent Mandate is `SIGNER_UNKNOWN` and never reaches the policy layer
 * (§6.7 rule 2). Every failure is a `DomainError` carrying a reason code.
 */
export class Es256Verifier implements MandateVerifier {
  constructor(
    private readonly resolver: KeyResolver,
    private readonly clock: Clock,
    private readonly skewSeconds: number = CLOCK_SKEW_SECONDS,
  ) {}

  async verify(jwt: string, expected: VerifyExpectation): Promise<VerifiedJwt> {
    const header = readProtectedHeader(jwt);
    const iss = readUnverifiedIssuer(jwt);
    const pinned = this.pinFor(iss, header.kid, expected);
    const now = this.clock.now();
    const claims = await this.checkSignature(jwt, pinned, expected, now, iss);
    assertLifetime(claims, now, this.skewSeconds);
    return {
      claims,
      kid: pinned.kid,
      role: pinned.role,
      jwtHash: sha256Hex(jwt),
    };
  }

  private pinFor(
    iss: string,
    kid: string,
    expected: VerifyExpectation,
  ): PinnedJwk {
    if (expected.issuer !== null && expected.issuer !== iss) {
      throw new DomainError("SIGNER_UNKNOWN");
    }
    const pinned = this.resolver.resolve(iss, kid);
    if (pinned === null || pinned.role !== expected.role) {
      throw new DomainError("SIGNER_UNKNOWN");
    }
    return pinned;
  }

  private async checkSignature(
    jwt: string,
    pinned: PinnedJwk,
    expected: VerifyExpectation,
    now: Date,
    iss: string,
  ): Promise<Record<string, unknown>> {
    try {
      const key = await importAsymmetricJwk(jwkOf(pinned));
      const result = await jwtVerify(jwt, key, {
        algorithms: [MANDATE_ALG],
        audience: expected.audience,
        issuer: iss,
        typ: "JWT",
        requiredClaims: REQUIRED_CLAIMS,
        clockTolerance: this.skewSeconds,
        currentDate: now,
      });
      return { ...result.payload };
    } catch (cause) {
      throw toDomainError(cause);
    }
  }
}

/**
 * §6.1 splits the two: ±120 s of skew on `nbf`/`iat`, but **`exp` is hard**.
 * `jose` never checks `iat` at all — a mandate stamped into the future would
 * otherwise buy itself unbounded extra lifetime — and it applies the same
 * tolerance to `exp`, which would hand an expired mandate two free minutes.
 */
function assertLifetime(
  claims: Record<string, unknown>,
  now: Date,
  skewSeconds: number,
): void {
  const seconds = Math.floor(now.getTime() / 1000);
  const iat = numericClaim(claims["iat"]);
  if (iat > seconds + skewSeconds) {
    throw new DomainError("TIMESTAMP_SKEW");
  }
  if (numericClaim(claims["exp"]) <= seconds) {
    throw new DomainError("TIMESTAMP_SKEW");
  }
}

function numericClaim(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DomainError("MANDATE_MALFORMED");
  }
  return value;
}

function jwkOf(pinned: PinnedJwk): Record<string, string> {
  return {
    kty: pinned.kty,
    crv: pinned.crv,
    alg: pinned.alg,
    x: pinned.x,
    y: pinned.y,
  };
}
