import type { ReasonCode } from "@covenant/domain";
import { DomainError } from "@covenant/domain";

const CLAIM_FAILURE_CODES: Readonly<Record<string, ReasonCode>> = {
  iss: "SIGNER_UNKNOWN",
  aud: "SIGNER_UNKNOWN",
  sub: "MANDATE_MALFORMED",
  jti: "MANDATE_MALFORMED",
  nbf: "TIMESTAMP_SKEW",
  iat: "TIMESTAMP_SKEW",
  exp: "TIMESTAMP_SKEW",
};

const ERROR_CODES: Readonly<Record<string, ReasonCode>> = {
  ERR_JWS_SIGNATURE_VERIFICATION_FAILED: "SIGNATURE_INVALID",
  ERR_JWS_INVALID: "SIGNATURE_INVALID",
  ERR_JWT_EXPIRED: "TIMESTAMP_SKEW",
  ERR_JWT_INVALID: "MANDATE_MALFORMED",
  ERR_JOSE_ALG_NOT_ALLOWED: "SIGNATURE_INVALID",
};

/**
 * `jose` failures become reason codes, never raw errors escaping the package
 * (§4.6). A claim that failed validation is mapped by *which* claim: a bad
 * `aud` or `iss` is a trust-ring question (`SIGNER_UNKNOWN`), a bad `nbf`/`exp`
 * is a clock question (`TIMESTAMP_SKEW`).
 */
export function toDomainError(cause: unknown): DomainError {
  if (cause instanceof DomainError) {
    return cause;
  }
  const code = codeOf(cause);
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
    return new DomainError(
      CLAIM_FAILURE_CODES[claimOf(cause)] ?? "MANDATE_MALFORMED",
    );
  }
  return new DomainError(ERROR_CODES[code] ?? "MANDATE_MALFORMED");
}

function codeOf(cause: unknown): string {
  if (typeof cause !== "object" || cause === null) {
    return "";
  }
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

function claimOf(cause: unknown): string {
  const claim = (cause as { claim?: unknown }).claim;
  return typeof claim === "string" ? claim : "";
}
