import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IssuedMandate } from "@covenant/mandates";

import { loadConfig } from "../../src/config.js";
import type { RunningGateway } from "../../src/server-runtime.js";
import { startGateway } from "../../src/server-runtime.js";
import { AcpClient } from "./acp-client.js";
import { attestationClaims, buildCrypto } from "./crypto.js";
import type { SmokeCrypto } from "./crypto.js";
import {
  AGENT_URN,
  SKU,
  TENANT,
  boundsOf,
  paymentRequestOf,
  quoteAttestationContent,
  quoteOf,
} from "./fixtures.js";

export interface Harness {
  readonly running: RunningGateway;
  readonly client: AcpClient;
  readonly crypto: SmokeCrypto;
  readonly dir: string;
}

/** A temp file database and a minted trust ring: no repo state, no secrets. */
export async function boot(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "covenant-smoke-"));
  const running = await startGateway(
    loadConfig({
      PORT: "0",
      COVENANT_DB: join(dir, "covenant.db"),
      COVENANT_KEY_DIR: join(dir, "keys"),
      COVENANT_RAIL: "fake",
      COVENANT_TENANT: TENANT,
      LOG_LEVEL: "fatal",
    }),
  );
  const crypto = buildCrypto(join(dir, "keys"));
  return { running, client: new AcpClient(running.url, crypto), crypto, dir };
}

export async function teardown(harness: Harness): Promise<void> {
  await harness.running.shutdown("SIGTERM");
  try {
    rmSync(harness.dir, { recursive: true, force: true });
  } catch {
    // Windows can hold the WAL file a moment after close; the OS reaps temp.
  }
}

function writeBody(
  content: Readonly<Record<string, unknown>>,
  channel: "merchant_attestation" | "verified_api",
  extras: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return {
    type: "fact",
    tier_claim: channel === "merchant_attestation" ? "P2" : "P1",
    content,
    source_channel: channel,
    subject: SKU,
    t_valid: new Date().toISOString(),
    t_invalid: null,
    user_id: "",
    tenant_id: TENANT,
    ...extras,
  };
}

export interface SeededMemory {
  readonly entryIds: readonly string[];
  readonly digest: string;
  readonly quoteJti: string;
}

/**
 * The agent's own path: two writes through the gate, then one retrieval — and
 * the digest the gateway will re-derive comes from that retrieval, because
 * `POST /memory/retrieve` is the only path that mints one (§4.10).
 */
export async function seedMemory(harness: Harness): Promise<SeededMemory> {
  const now = new Date();
  const userId = harness.crypto.issuerFor("user");
  const merchant = harness.crypto.issuerFor("merchant");
  const quoteJti = `urn:uuid:${harness.crypto.ids.uuid()}`;
  const attestationJti = `urn:uuid:${harness.crypto.ids.uuid()}`;
  const sig = await harness.crypto.signer.sign(
    attestationClaims(merchant, attestationJti, now),
    "merchant",
  );
  await harness.client.post(
    "/v1/memory/write",
    writeBody(quoteAttestationContent(quoteOf(now, quoteJti)), "merchant_attestation", {
      predicate: "price",
      sig,
      source_ref: attestationJti,
      user_id: userId,
    }),
  );
  await harness.client.post(
    "/v1/memory/write",
    writeBody({ shoe_size_uk: 8 }, "verified_api", {
      predicate: "size",
      sig: null,
      source_ref: "catalog-api",
      user_id: userId,
    }),
  );
  return { ...(await retrieve(harness, userId)), quoteJti };
}

async function retrieve(
  harness: Harness,
  userId: string,
): Promise<{ entryIds: readonly string[]; digest: string }> {
  const response = await harness.client.post("/v1/memory/retrieve", {
    query: "running shoes for the user",
    action_class: "cart-construction",
    limit: 64,
    as_of: null,
    user_id: userId,
    tenant_id: TENANT,
  });
  const body = (await response.json()) as {
    entries: { id: string }[];
    digest: string;
  };
  return { entryIds: body.entries.map((entry) => entry.id), digest: body.digest };
}

export interface Chain {
  readonly intent: IssuedMandate;
  readonly cart: IssuedMandate;
}

/** Real user- and merchant-signed credentials, minted from the ring on disk. */
export async function issueChain(
  harness: Harness,
  seeded: SeededMemory,
): Promise<Chain> {
  const now = new Date();
  const user = harness.crypto.issuerFor("user");
  const merchant = harness.crypto.issuerFor("merchant");
  const intent = await harness.crypto.intents.issue({
    userIss: user,
    tenantId: TENANT,
    naturalLanguageDescription:
      "Buy one pair of running shoes under Rs 2,000, refundable, from Kolam Run.",
    agentInstanceId: AGENT_URN,
    bounds: boundsOf(now, merchant),
    ttlSeconds: 86400,
    issuedAt: now,
    jti: null,
  });
  const cart = await harness.crypto.carts.issue({
    merchantIss: merchant,
    userSub: user,
    tenantId: TENANT,
    cartId: `urn:covenant:cart:${harness.crypto.ids.uuid()}`,
    intentJti: intent.jti,
    intentJwtHash: intent.jwtHash,
    paymentRequest: paymentRequestOf(),
    memoryDigest: seeded.digest,
    memoryEntryIds: [...seeded.entryIds],
    memoryTierFloor: "P1",
    riskData: null,
    quote: quoteOf(now, seeded.quoteJti),
    agentInstanceId: AGENT_URN,
    ttlSeconds: 900,
    issuedAt: now,
    jti: null,
  });
  return { intent, cart };
}
