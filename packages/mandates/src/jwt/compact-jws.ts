import { DomainError, MANDATE_ALG, isKid } from "@covenant/domain";

export interface ProtectedHeader {
  readonly alg: string;
  readonly typ: string;
  readonly kid: string;
}

/**
 * `alg` is pinned and `none` is rejected **before `jose` is even called**
 * (§6.1): the decode below is base64url and `JSON.parse`, nothing more, so no
 * algorithm-agile code path exists for a header to steer.
 */
export function readProtectedHeader(compactJws: string): ProtectedHeader {
  const parts = compactJws.split(".");
  if (parts.length !== 3 || parts[0] === undefined) {
    throw new DomainError("MANDATE_MALFORMED");
  }
  const raw = decodeSegment(parts[0], "MANDATE_MALFORMED");
  const alg = raw["alg"];
  const typ = raw["typ"];
  const kid = raw["kid"];
  if (typeof alg !== "string" || alg !== MANDATE_ALG) {
    throw new DomainError("SIGNATURE_INVALID");
  }
  if (typ !== "JWT" || typeof kid !== "string" || !isKid(kid)) {
    throw new DomainError("SIGNER_UNKNOWN");
  }
  return { alg, typ, kid };
}

/**
 * The `iss` is needed to pick a key, so it must be read before the signature
 * is checked. Nothing read here is trusted for anything else: it selects a
 * candidate key and the signature then decides.
 */
export function readUnverifiedIssuer(compactJws: string): string {
  const parts = compactJws.split(".");
  if (parts.length !== 3 || parts[1] === undefined) {
    throw new DomainError("MANDATE_MALFORMED");
  }
  const iss = decodeSegment(parts[1], "MANDATE_MALFORMED")["iss"];
  if (typeof iss !== "string" || iss.length === 0) {
    throw new DomainError("SIGNER_UNKNOWN");
  }
  return iss;
}

function decodeSegment(
  segment: string,
  code: "MANDATE_MALFORMED",
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new DomainError(code);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new DomainError(code);
  }
  return parsed as Record<string, unknown>;
}
