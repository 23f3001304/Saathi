import { sha256Hex } from "@covenant/domain";

/** Exact match, fail closed (§4.2). */
export const COVENANT_API_VERSION = "2026-08-31";

export const MANDATE_ALG = "ES256";

export interface AcpSignature {
  readonly kid: string;
  /** base64url of the ES256 signature. */
  readonly sig: string;
}

/**
 * The agent side of §4.2. `MandateSigner` signs claim sets, not raw bytes, so
 * the port the client needs is narrower than the one `domain` exposes; the
 * adapter that bridges them lives next door.
 */
export interface RequestSigner {
  sign(base: string): Promise<AcpSignature>;
}

export interface AcpRequestParts {
  readonly method: string;
  /** Path only, no query string — `/v1/verify-cart`. */
  readonly path: string;
  readonly timestamp: string;
  readonly idempotencyKey: string;
  readonly body: string;
}

/**
 * Method, path, timestamp and idempotency key are all bound, so a captured
 * `verify-cart` body cannot be replayed at `execute-payment` (§4.2).
 */
export function signingBase(parts: AcpRequestParts): string {
  return [
    parts.method,
    parts.path,
    parts.timestamp,
    parts.idempotencyKey,
    sha256Hex(parts.body),
  ].join("\n");
}

export function signatureHeader(signature: AcpSignature): string {
  return `keyid=${signature.kid},alg=${MANDATE_ALG},sig=${signature.sig}`;
}

export interface AcpHeaderInput extends AcpRequestParts {
  readonly requestId: string;
  readonly signature: AcpSignature;
  readonly apiVersion: string;
}

/** The five ACP headers, plus the content type every §4 route speaks. */
export function acpHeaders(input: AcpHeaderInput): Record<string, string> {
  return {
    "content-type": "application/json",
    "Idempotency-Key": input.idempotencyKey,
    "Request-Id": input.requestId,
    Signature: signatureHeader(input.signature),
    Timestamp: input.timestamp,
    "API-Version": input.apiVersion,
  };
}

/** GET routes are read-only projections: only these two are required (§4.2). */
export function readHeaders(
  requestId: string,
  apiVersion: string,
): Record<string, string> {
  return { "Request-Id": requestId, "API-Version": apiVersion };
}
