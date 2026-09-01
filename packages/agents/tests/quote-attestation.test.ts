import { describe, expect, it } from "vitest";

import { CatalogMemoryWriter } from "../src/buyer/catalog-memory.js";
import {
  DEFAULT_GATEWAY_CONFIG,
  GatewayClient,
} from "../src/buyer/gateway-client.js";
import { JwsRequestSigner } from "../src/buyer/jws-request-signer.js";
import { capturingFetch, jsonResponse } from "./doubles.js";
import { FakeClock, HmacMandateSigner, SeqIds } from "./fakes.js";

const AT = "2026-08-31T09:14:02.113Z";

const WRITE_OK = {
  ok: true,
  memory_id: "mem_1",
  status: "committed",
  tier_granted: "P2",
  reason_code: null,
  rule: null,
  human: null,
  to_pass: null,
};

function writerOver(responses: readonly Response[]) {
  const { fetch: fetchImpl, calls } = capturingFetch(responses);
  const client = new GatewayClient(
    fetchImpl,
    new JwsRequestSigner(new HmacMandateSigner(), "user"),
    new FakeClock(AT),
    new SeqIds(),
    {
      ...DEFAULT_GATEWAY_CONFIG,
      baseUrl: "https://gateway.test",
      tenantId: "tnt_demo",
    },
  );
  return {
    calls,
    writer: new CatalogMemoryWriter(client, new FakeClock(AT), {
      userId: "user_1",
      tenantId: "tnt_demo",
    }),
  };
}

describe("what a signed quote records about the negotiation", () => {
  /** Invariant 4: the ask travels inside what the merchant signed, so the
   *  gateway records the negotiation from an attested number rather than from
   *  the buyer's own account of what it asked for. */
  it("carries the buyer's ask and the SKU into the attested content", async () => {
    const { writer, calls } = writerOver([jsonResponse(200, WRITE_OK)]);

    await writer.writeQuoteFact({
      sku: "ASC-GC9-UK8",
      merchantId: "kolam-run",
      quoteJti: "urn:uuid:q2",
      totalPaise: 180000,
      currency: "INR",
      expiry: "2026-08-31T09:24:02.113Z",
      reservationId: "resv_2",
      askedUnitPaise: 180000,
      attestation: "a.b.c",
    });

    expect(
      JSON.parse(calls[0]?.init?.body as string).content as unknown,
    ).toMatchObject({
      sku_id: "ASC-GC9-UK8",
      asked_unit_paise: 180000,
      total_paise: 180000,
    });
  });
});
