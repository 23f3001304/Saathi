import { GATEWAY_AUDIENCE, GATEWAY_ISSUER } from "@covenant/domain";
import type { GeneratedKeyMaterial } from "@covenant/mandates";
import {
  Es256Signer,
  Es256Verifier,
  generateKeyMaterial,
  KeyStore,
  PinnedJwkResolver,
} from "@covenant/mandates";
import { describe, expect, it } from "vitest";

import { FixtureCatalogSource } from "../src/merchant/catalog-source.js";
import {
  DEMO_CATALOG,
  DEMO_MERCHANT_ID,
  DEMO_MERCHANT_ISS,
} from "../src/merchant/demo-catalog.js";
import { QuoteTool } from "../src/merchant/quote-tool.js";
import { AgentInstance } from "../src/shared/agent-instance.js";
import { ToolEnvelopeSigner } from "../src/shared/tool-envelope-signer.js";
import {
  envelopeVerifierConfig,
  ToolEnvelopeVerifier,
} from "../src/shared/tool-envelope-verifier.js";
import { FakeClock, SeqIds } from "./fakes.js";

const NOW = new Date("2026-08-31T09:14:02.113Z");
const USER_URN = "urn:covenant:user:9f3c";
const SERVER = "covenant_merchant";

const CALL = {
  tool: "quote_request",
  server: SERVER,
  args: { sku: "ASC-GC9-UK8", qty: 1, target_unit_paise: 189900 },
};

interface RealRing {
  readonly clock: FakeClock;
  readonly signer: Es256Signer;
  readonly verifier: Es256Verifier;
}

/**
 * Real ES256 keys, a real pinned trust ring, a real `Es256Verifier` — the
 * gap this suite closes was invisible precisely because `HmacMandateVerifier`
 * (see fakes.ts) has no required-claims list of its own to diverge from
 * `Es256Verifier`'s. Only the real verifier can catch a missing `sub` again.
 */
async function buildRealRing(): Promise<RealRing> {
  const material: GeneratedKeyMaterial = await generateKeyMaterial(
    { user: USER_URN, merchant: DEMO_MERCHANT_ISS, gateway: GATEWAY_ISSUER },
    NOW,
  );
  const clock = new FakeClock(NOW.toISOString());
  const resolver = new PinnedJwkResolver(material.trustRing, clock);
  return {
    clock,
    signer: new Es256Signer(new KeyStore(material.privateKeys)),
    verifier: new Es256Verifier(resolver, clock),
  };
}

describe("AM2 tool envelope against a real pinned trust ring", () => {
  it("verifies a buyer-signed envelope with a real Es256Verifier", async () => {
    const ring = await buildRealRing();
    const instance = new AgentInstance("buyer", USER_URN, new SeqIds());
    const envelopeSigner = new ToolEnvelopeSigner(
      ring.signer,
      ring.clock,
      new SeqIds(),
      instance,
      { keyRole: "user", ttlSeconds: 120 },
    );
    const envelopeVerifier = new ToolEnvelopeVerifier(
      ring.verifier,
      ring.clock,
      envelopeVerifierConfig(SERVER, "user"),
    );

    const envelope = await envelopeSigner.sign(CALL);
    const result = await envelopeVerifier.verify(envelope.jws, CALL);

    expect(result.ok).toBe(true);
    expect(result.ok && result.claims.tool).toBe(CALL.tool);
  });
});

describe("Merchant-signed quote against a real pinned trust ring", () => {
  it("verifies a QuoteTool quote with a real Es256Verifier", async () => {
    const ring = await buildRealRing();
    const quoteTool = new QuoteTool(
      new FixtureCatalogSource(DEMO_CATALOG),
      ring.signer,
      ring.clock,
      new SeqIds(),
      {
        merchantIss: DEMO_MERCHANT_ISS,
        merchantId: DEMO_MERCHANT_ID,
        ttlSeconds: 600,
      },
    );

    const issued = await quoteTool.quote({
      sku: "ASC-GC9-UK8",
      qty: 1,
      target_unit_paise: null,
    });
    if (issued === null) {
      throw new Error("expected QuoteTool to issue a quote");
    }
    const verified = await ring.verifier.verify(issued.jws, {
      role: "merchant",
      audience: GATEWAY_AUDIENCE,
      issuer: null,
    });

    expect(verified.claims["sub"]).toBe(DEMO_MERCHANT_ISS);
    expect(verified.claims["merchant_id"]).toBe(DEMO_MERCHANT_ID);
  });
});
