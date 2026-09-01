import { existsSync } from "node:fs";
import { join } from "node:path";

import type { Clock, IdGenerator, Logger } from "@covenant/domain";
import { AdmissionGate } from "@covenant/gateway";
import {
  CredentialEnvelope,
  Es256Signer,
  Es256Verifier,
  IntentMandateIssuer,
  JwksLoader,
  MandateChainBinder,
  MandateChainVerifier,
  MerchantAuthorization,
  PaymentMandateIssuer,
  PinnedJwkResolver,
  TRUST_RING_FILE,
  UserAuthorization,
  generateAndWrite,
} from "@covenant/mandates";
import type { TrustRing } from "@covenant/mandates";

import type { GatewayConfig } from "../config.js";
import { AgentAwareSignatureVerifier } from "../http/agent-signature.js";

export interface KeyParts {
  /** The pin set exactly as it was read at boot; the merchant console shows it. */
  readonly ring: TrustRing;
  readonly keys: PinnedJwkResolver;
  readonly verifier: Es256Verifier;
  readonly chain: MandateChainVerifier;
  readonly intents: IntentMandateIssuer;
  readonly payments: PaymentMandateIssuer;
  readonly admission: AdmissionGate;
}

/**
 * §6.7 rule 7: a judge's clone runs with no secrets in the repo, so an absent
 * trust ring is minted rather than fatal — once, at boot, in the configured
 * key directory.
 *
 * DECISION: the bootstrap is logged, not ledgered. Why: `EVENT_KINDS` is
 * frozen (§10.3) and carries no key-material kind; appending one of the
 * mandate kinds to describe a keypair would put a false statement in a chain
 * whose entire value is that it contains none. `keys.bootstrapped` at `warn`
 * plus `readyz.jwks_loaded` is the honest record.
 */
export async function bootstrapKeys(
  config: GatewayConfig,
  clock: Clock,
  logger: Logger,
): Promise<boolean> {
  if (existsSync(join(config.keyDir, TRUST_RING_FILE))) {
    return false;
  }
  if (!config.keyBootstrap) {
    return false;
  }
  const roles = await generateAndWrite(config.keyDir, clock.now());
  logger.warn("keys.bootstrapped", {
    key_dir: config.keyDir,
    roles: [...roles],
    note: "dev-only trust ring minted because none was present",
  });
  return true;
}

/**
 * The pinned trust ring, the signer/verifier pair built on it, the mandate
 * chain verifier and the ACP admission gate (§2.8, §6.7).
 *
 * The process loads only the **gateway** private key: three keypairs exist so
 * that a process which was not given a role's key cannot sign for it, and
 * loading all three here would quietly undo that.
 */
export function wireKeys(config: GatewayConfig, clock: Clock, ids: IdGenerator, logger: Logger): KeyParts {
  const loader = new JwksLoader(config.keyDir, logger);
  const ring = loader.loadTrustRing();
  const keys = new PinnedJwkResolver(ring, clock);
  const signer = new Es256Signer(loader.loadKeyStore(["gateway"]));
  const verifier = new Es256Verifier(keys, clock);
  const envelope = new CredentialEnvelope(clock, ids);
  const merchantAuth = new MerchantAuthorization(signer, verifier, ids);
  return {
    ring,
    keys,
    verifier,
    chain: new MandateChainVerifier(
      verifier,
      new MandateChainBinder(),
      merchantAuth,
      keys.pinnedContextUris(),
    ),
    intents: new IntentMandateIssuer(signer, envelope),
    payments: new PaymentMandateIssuer(
      signer,
      envelope,
      new UserAuthorization(signer, verifier, ids),
      clock,
    ),
    admission: new AdmissionGate(
      new AgentAwareSignatureVerifier(keys),
      clock,
      config.apiVersion,
    ),
  };
}
