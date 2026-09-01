import { createPrivateKey, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MandateRole } from "../protocol.js";
import { MANDATE_ROLES } from "../protocol.js";

interface RingIssuer {
  readonly role: MandateRole;
  readonly kids: readonly string[];
}

interface RingFile {
  readonly issuers: Readonly<Record<string, RingIssuer>>;
  readonly pinned_context_uris: readonly string[];
}

type Jwk = Readonly<Record<string, string>>;

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function field(jwk: Jwk, key: string): string {
  const value = jwk[key];
  if (value === undefined) {
    throw new Error(`private JWK is missing "${key}"`);
  }
  return value;
}

function privateKeyOf(jwk: Jwk): KeyObject {
  return createPrivateKey({
    key: {
      kty: field(jwk, "kty"),
      crv: field(jwk, "crv"),
      x: field(jwk, "x"),
      y: field(jwk, "y"),
      d: field(jwk, "d"),
    },
    format: "jwk",
  });
}

/**
 * The buyer/merchant half of the trust ring, read off disk exactly as the
 * signing sheet and the merchant agent read theirs (§6.7). Reading key *files*
 * is not importing code: the harness still speaks nothing but HTTP to the
 * service, and it holds no key the demo does not already hand to an agent.
 *
 * The gateway's own private key is loaded too when present, and deliberately
 * never used to sign anything the gateway would accept as a mandate — the
 * three-keypair split is the property under test, not an obstacle to it.
 */
export class TrustRing {
  private constructor(
    private readonly ring: RingFile,
    private readonly jwks: ReadonlyMap<MandateRole, Jwk>,
    private readonly keys: ReadonlyMap<MandateRole, KeyObject>,
  ) {}

  static load(keyDir: string): TrustRing {
    const ring = readJson(join(keyDir, "trust-ring.json")) as RingFile;
    const jwks = new Map<MandateRole, Jwk>();
    const keys = new Map<MandateRole, KeyObject>();
    for (const role of MANDATE_ROLES) {
      const path = join(keyDir, "private", `${role}.private.jwk.json`);
      const jwk = readJson(path) as Jwk;
      jwks.set(role, jwk);
      keys.set(role, privateKeyOf(jwk));
    }
    return new TrustRing(ring, jwks, keys);
  }

  /** `urn:covenant:user:…` etc. — the URN the ring binds to that role. */
  issuerFor(role: MandateRole): string {
    const found = Object.entries(this.ring.issuers).find(
      ([, issuer]) => issuer.role === role,
    );
    if (found === undefined) {
      throw new Error(`trust ring has no issuer for role ${role}`);
    }
    return found[0];
  }

  kidFor(role: MandateRole): string {
    const kid = this.jwks.get(role)?.["kid"];
    if (kid === undefined) {
      throw new Error(`no private key on disk for role ${role}`);
    }
    return kid;
  }

  privateKey(role: MandateRole): KeyObject {
    const key = this.keys.get(role);
    if (key === undefined) {
      throw new Error(`no private key on disk for role ${role}`);
    }
    return key;
  }

  pinnedContextUris(): readonly string[] {
    return this.ring.pinned_context_uris;
  }
}
