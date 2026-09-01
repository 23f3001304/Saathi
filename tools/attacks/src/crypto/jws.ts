import { createSign, randomUUID, type KeyObject } from "node:crypto";

import type { MandateRole } from "../protocol.js";
import { MANDATE_ALG } from "../protocol.js";
import type { TrustRing } from "./trust-ring.js";

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * ES256 in the JWS raw `r || s` encoding. Node defaults to DER and the gateway
 * pins `ieee-p1363` precisely so an algorithm-agile path cannot be steered
 * from outside — the harness therefore has to produce the pinned encoding, and
 * a DER signature here would be rejected, which is the correct behaviour to
 * depend on rather than to work around.
 */
export function es256(key: KeyObject, signingInput: string): string {
  return createSign("SHA256")
    .update(signingInput, "utf8")
    .sign({ key, dsaEncoding: "ieee-p1363" })
    .toString("base64url");
}

export interface SignedJws {
  readonly jwt: string;
  readonly jti: string;
}

/** Compact JWS with the §6.1 protected header: `ES256` / `JWT` / role kid. */
export function signCompact(
  ring: TrustRing,
  role: MandateRole,
  claims: Readonly<Record<string, unknown>>,
): string {
  const header = b64url({
    alg: MANDATE_ALG,
    typ: "JWT",
    kid: ring.kidFor(role),
  });
  const input = `${header}.${b64url(claims)}`;
  return `${input}.${es256(ring.privateKey(role), input)}`;
}

/** §6.1: the `jti` IS the nonce, and its shape is `urn:uuid:<uuid v4>`. */
export function mintJti(): string {
  return `urn:uuid:${randomUUID()}`;
}

export function epochSeconds(instant: Date): number {
  return Math.floor(instant.getTime() / 1000);
}
