import type { Logger, MandateRole } from "@covenant/domain";
import { GATEWAY_AUDIENCE } from "@covenant/domain";
import {
  CartMandateIssuer,
  CredentialEnvelope,
  Es256Signer,
  Es256Verifier,
  IntentMandateIssuer,
  JwksLoader,
  KeyStore,
  MerchantAuthorization,
  PinnedJwkResolver,
} from "@covenant/mandates";

import { RandomIds, SystemClock } from "../../src/adapters/system-ports.js";

class SilentLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  fatal(): void {}
}

export interface SmokeCrypto {
  readonly keys: KeyStore;
  readonly resolver: PinnedJwkResolver;
  readonly signer: Es256Signer;
  readonly intents: IntentMandateIssuer;
  readonly carts: CartMandateIssuer;
  readonly ids: RandomIds;
  readonly clock: SystemClock;
  issuerFor(role: MandateRole): string;
}

/**
 * The buyer/merchant side of the demo, built from the trust ring the gateway
 * minted at boot. The suite mocks no crypto anywhere: these are the same ES256
 * keypairs the service verifies against, read off disk exactly as the merchant
 * agent and the signing sheet would read theirs.
 */
export function buildCrypto(keyDir: string): SmokeCrypto {
  const clock = new SystemClock();
  const ids = new RandomIds();
  const loader = new JwksLoader(keyDir, new SilentLogger());
  const resolver = new PinnedJwkResolver(loader.loadTrustRing(), clock);
  const keys = loader.loadKeyStore();
  const signer = new Es256Signer(keys);
  const verifier = new Es256Verifier(resolver, clock);
  const envelope = new CredentialEnvelope(clock, ids);
  return {
    keys,
    resolver,
    signer,
    ids,
    clock,
    intents: new IntentMandateIssuer(signer, envelope),
    carts: new CartMandateIssuer(
      signer,
      envelope,
      new MerchantAuthorization(signer, verifier, ids),
      clock,
    ),
    issuerFor: (role) => resolver.issuerFor(role) ?? "",
  };
}

/** A merchant price attestation: the JWS that buys a `merchant_attestation` P2. */
export function attestationClaims(
  issuer: string,
  jti: string,
  now: Date,
): Readonly<Record<string, unknown>> {
  const iat = Math.floor(now.getTime() / 1000);
  return {
    iss: issuer,
    sub: issuer,
    aud: GATEWAY_AUDIENCE,
    iat,
    exp: iat + 3600,
    jti,
  };
}
