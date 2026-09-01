import type {
  MandateEnvelope,
  MandateKind,
  VerifiedJwt,
} from "@covenant/domain";

import {
  CREDENTIAL_TYPE_OF,
  VERIFIABLE_CREDENTIAL,
  isJti,
} from "./mandate-claims.js";
import { array, malformed, num, record, str } from "./subject-fields.js";

export interface ParsedCredential {
  readonly envelope: MandateEnvelope;
  /** Left `unknown[]` on purpose: the URI pin, not this reader, judges them. */
  readonly contexts: readonly unknown[];
  readonly subject: Readonly<Record<string, unknown>>;
}

/**
 * JWT-VC → the registered-claim half of `MandateEnvelope`. Structural problems
 * are `MANDATE_MALFORMED`; a wrong-but-well-formed extension URI is carried
 * through untouched so the URI pin can fail it as `URI_DOWNGRADE` rather than
 * having it disappear into a parse error (§7.4).
 */
export class CredentialReader {
  read(verified: VerifiedJwt, kind: MandateKind): ParsedCredential {
    const claims = verified.claims as Record<string, unknown>;
    const iss = str(claims["iss"]);
    const iat = num(claims["iat"]);
    const jti = str(claims["jti"]);
    if (!isJti(jti)) {
      throw malformed();
    }
    const vc = record(claims["vc"]);
    const subject = record(vc["credentialSubject"]);
    assertCredentialType(vc, kind, iss);
    return {
      envelope: {
        jti,
        iss,
        sub: str(claims["sub"]),
        aud: str(claims["aud"]),
        iat: isoOf(iat),
        nbf: isoOf(optionalNum(claims["nbf"]) ?? iat),
        exp: isoOf(num(claims["exp"])),
        kid: verified.kid,
        role: verified.role,
        jwtHash: verified.jwtHash,
        tenant_id: str(subject["tenant_id"]),
        ap2_extension_uri: uriOf(subject["ap2_extension_uri"]),
      },
      contexts: array(vc["@context"]),
      subject,
    };
  }
}

function assertCredentialType(
  vc: Record<string, unknown>,
  kind: MandateKind,
  iss: string,
): void {
  const types = array(vc["type"]);
  const wellFormed =
    types[0] === VERIFIABLE_CREDENTIAL &&
    types.includes(CREDENTIAL_TYPE_OF[kind]) &&
    vc["issuer"] === iss;
  if (!wellFormed) {
    throw malformed();
  }
}

function isoOf(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function uriOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalNum(value: unknown): number | null {
  return value === undefined ? null : num(value);
}
