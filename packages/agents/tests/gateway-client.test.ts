import { describe, expect, it } from "vitest";

import { signatureHeader, signingBase } from "../src/buyer/acp-headers.js";
import { JwsRequestSigner } from "../src/buyer/jws-request-signer.js";
import type { CapturedRequest } from "./doubles.js";
import { headerOf, jsonResponse } from "./doubles.js";
import { HmacMandateSigner } from "./fakes.js";
import { build, unreachableClient } from "./gateway-client-support.js";
import * as fixtures from "./response-fixtures.js";

describe("GatewayClient ACP headers (§4.2)", () => {
  it("sends all five headers, and binds the signature to the base string", async () => {
    const { client, calls } = build([
      jsonResponse(200, fixtures.approveUnsupervised),
    ]);

    await client.verifyCart({ cart_mandate_jwt: "a.b.c" });

    const [request] = calls;
    expect(request?.url).toBe("https://gateway.test/v1/verify-cart");
    expect(headerOf(request as CapturedRequest, "API-Version")).toBe(
      "2026-08-31",
    );
    expect(headerOf(request as CapturedRequest, "Timestamp")).toBe(
      "2026-08-31T09:14:02.113Z",
    );
    const idem = headerOf(request as CapturedRequest, "Idempotency-Key");
    const requestId = headerOf(request as CapturedRequest, "Request-Id");
    expect(idem).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).not.toBe(idem);
  });
});

describe("GatewayClient signature binding (§4.2)", () => {
  it("binds the signature to the signing base, not to the body alone", async () => {
    const { client, calls } = build([
      jsonResponse(200, fixtures.approveUnsupervised),
    ]);

    await client.verifyCart({ cart_mandate_jwt: "a.b.c" });

    const [request] = calls;
    const idem = headerOf(request as CapturedRequest, "Idempotency-Key");
    const expected = await new JwsRequestSigner(
      new HmacMandateSigner(),
      "user",
    ).sign(
      signingBase({
        method: "POST",
        path: "/v1/verify-cart",
        timestamp: "2026-08-31T09:14:02.113Z",
        idempotencyKey: idem as string,
        body: request?.init?.body as string,
      }),
    );
    expect(headerOf(request as CapturedRequest, "Signature")).toBe(
      signatureHeader(expected),
    );
    expect(headerOf(request as CapturedRequest, "Signature")).toContain(
      "keyid=user-2026-08-",
    );
  });
});

describe("GatewayClient request body", () => {
  it("stamps tenant_id into every body", async () => {
    const { client, calls } = build([
      jsonResponse(200, fixtures.approveUnsupervised),
    ]);

    await client.verifyCart({ cart_mandate_jwt: "a.b.c" });

    expect(JSON.parse(calls[0]?.init?.body as string)).toMatchObject({
      tenant_id: "tnt_demo",
      cart_mandate_jwt: "a.b.c",
    });
  });
});

interface ParseRow {
  readonly name: string;
  readonly body: unknown;
  readonly decision: string;
  readonly seals: number;
}

const PARSE_ROWS: readonly ParseRow[] = [
  {
    name: "unsupervised approve",
    body: fixtures.approveUnsupervised,
    decision: "approve",
    seals: 8,
  },
  {
    name: "supervised approve carries both mandate fields",
    body: fixtures.approveSupervised,
    decision: "approve",
    seals: 8,
  },
  {
    name: "cap rejection",
    body: fixtures.capExceeded,
    decision: "reject",
    seals: 8,
  },
  {
    name: "cooling-off hold",
    body: fixtures.cooloffHold,
    decision: "hold",
    seals: 8,
  },
  {
    name: "stage-0 rejection with zero seals",
    body: fixtures.stageZeroReject,
    decision: "reject",
    seals: 0,
  },
];

describe("GatewayClient response schemas (§4.4)", () => {
  it.each(PARSE_ROWS)("parses $name", async (row) => {
    const { client } = build([jsonResponse(200, row.body)]);

    const result = await client.verifyCart({});

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.decision).toBe(row.decision);
    expect(result.value.verdicts).toHaveLength(row.seals);
  });

  it("keeps payment_mandate_jwt and payment_mandate_draft independent", async () => {
    const { client } = build([jsonResponse(200, fixtures.approveSupervised)]);

    const result = await client.verifyCart({});

    expect(result.ok && result.value.payment_mandate_jwt).toBe(fixtures.JWS);
    expect(result.ok && result.value.payment_mandate_draft).toBe(fixtures.JWS);
  });
});

describe("GatewayClient rejects what the contract does not allow", () => {
  it("rejects a verdict list that is neither zero nor eight", async () => {
    const body = {
      ...fixtures.approveUnsupervised,
      verdicts: fixtures.allPass().slice(0, 3),
    };
    const { client } = build([jsonResponse(200, body)]);

    const result = await client.verifyCart({});

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.reasonCode).toBe("SCHEMA_VIOLATION");
  });

  it("reads the §4.6 error envelope, to_pass and all", async () => {
    const { client } = build([jsonResponse(409, fixtures.idempotencyConflict)]);

    const result = await client.verifyCart({});

    expect(!result.ok && result.failure.kind).toBe("error_envelope");
    expect(!result.ok && result.failure.reasonCode).toBe(
      "IDEMPOTENCY_CONFLICT",
    );
    expect(!result.ok && result.failure.toPass?.["remedy"]).toBe(
      "retry_with_new_idempotency_key",
    );
  });
});

describe("GatewayClient transport", () => {
  it("reports an unreachable gateway as a transport failure, not a throw", async () => {
    const client = unreachableClient();

    const result = await client.executePayment({
      payment_mandate_jwt: "a.b.c",
    });

    expect(!result.ok && result.failure.reasonCode).toBe("GATEWAY_UNREACHABLE");
  });

  it("parses execute-payment", async () => {
    const { client } = build([jsonResponse(200, fixtures.paymentExecuted)]);

    const result = await client.executePayment({
      payment_mandate_jwt: "a.b.c",
    });

    expect(result.ok && result.value.payment_link).toBe(
      "https://rzp.io/i/abc123",
    );
  });
});
