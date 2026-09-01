import { existsSync } from "node:fs";
import { join } from "node:path";

import type {
  Clock,
  IdGenerator,
  Logger,
  MandateSigner,
} from "@covenant/domain";
import {
  CartMandateIssuer,
  CredentialEnvelope,
  Es256Signer,
  Es256Verifier,
  IntentMandateIssuer,
  JwksLoader,
  MerchantAuthorization,
  PinnedJwkResolver,
  TRUST_RING_FILE,
} from "@covenant/mandates";

import type { AgentHostConfig } from "../config.js";

export interface KeyParts {
  readonly keys: PinnedJwkResolver;
  readonly verifier: Es256Verifier;
  /** Holds the **user** key only: the buyer cannot sign a merchant quote. */
  readonly buyerSigner: MandateSigner;
  /** Holds the **merchant** key only: the merchant cannot sign an intent. */
  readonly merchantSigner: MandateSigner;
  readonly intents: IntentMandateIssuer;
  readonly carts: CartMandateIssuer;
  readonly userIss: string;
  readonly merchantIss: string;
}

/**
 * DECISION: agent-host never mints a trust ring, unlike gateway-svc. Why: the
 * gateway's bootstrap exists so a judge's clone boots with no secrets, and a
 * *second* process minting into the same directory is a race whose loser signs
 * with keys nobody pinned. An agent that can mint its own trust ring is an
 * agent granting itself authority, so an absent ring is a readable failure
 * naming the fix instead.
 */
function assertRing(keyDir: string): void {
  if (existsSync(join(keyDir, TRUST_RING_FILE))) {
    return;
  }
  throw new Error(
    `agent-host cannot start: no trust ring at ${join(keyDir, TRUST_RING_FILE)}.\n` +
      "  Start gateway-svc first (it mints a dev ring at boot) or point COVENANT_KEY_DIR at one.",
  );
}

/**
 * The pinned ring, one signer per role this process legitimately holds, and the
 * two issuers built on them (§6.7). agent-host hosts both demo agents, so it
 * holds two private keys — but in two key stores, so the split that makes a
 * merchant-signed Intent Mandate `SIGNER_UNKNOWN` is enforced by what each
 * signer *can reach*, not by which argument a caller remembered to pass.
 */
export function wireKeys(
  config: AgentHostConfig,
  clock: Clock,
  ids: IdGenerator,
  logger: Logger,
): KeyParts {
  assertRing(config.keyDir);
  const loader = new JwksLoader(config.keyDir, logger);
  const keys = new PinnedJwkResolver(loader.loadTrustRing(), clock);
  const verifier = new Es256Verifier(keys, clock);
  const buyerSigner = new Es256Signer(loader.loadKeyStore(["user"]));
  const merchantSigner = new Es256Signer(loader.loadKeyStore(["merchant"]));
  const envelope = new CredentialEnvelope(clock, ids);
  return {
    keys,
    verifier,
    buyerSigner,
    merchantSigner,
    intents: new IntentMandateIssuer(buyerSigner, envelope),
    carts: new CartMandateIssuer(
      merchantSigner,
      envelope,
      new MerchantAuthorization(merchantSigner, verifier, ids),
      clock,
    ),
    userIss: issuerOf(keys, "user"),
    merchantIss: issuerOf(keys, "merchant"),
  };
}

function issuerOf(keys: PinnedJwkResolver, role: "user" | "merchant"): string {
  const issuer = keys.issuerFor(role);
  if (issuer === null) {
    throw new Error(
      `agent-host cannot start: trust ring names no ${role} issuer`,
    );
  }
  return issuer;
}
