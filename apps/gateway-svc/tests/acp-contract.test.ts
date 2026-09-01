import { randomUUID } from "node:crypto";

import { JwsRequestSigner, signatureHeader, signingBase } from "@covenant/agents";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { API_VERSION } from "../src/config.js";
import { TENANT } from "./support/fixtures.js";
import type { Harness } from "./support/flow.js";
import { boot, teardown } from "./support/flow.js";

let harness: Harness;

beforeAll(async () => {
  harness = await boot();
}, 60_000);

afterAll(async () => {
  await teardown(harness);
});

/**
 * The wire contract between `packages/agents`' `GatewayClient` and this
 * service's admission middleware, exercised with the buyer's *own* signer over
 * real HTTP. Both sides commit to the same §4.2 base string; the buyer reaches
 * it through a one-claim JWS because the frozen `MandateSigner` port signs
 * claim sets, so the middleware accepts that encoding as well as raw bytes.
 */
async function post(
  path: string,
  body: unknown,
  mutate: (raw: string) => string = (raw) => raw,
): Promise<Response> {
  const signer = new JwsRequestSigner(harness.crypto.signer, "user");
  const raw = JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const idempotencyKey = randomUUID();
  const signature = await signer.sign(
    signingBase({ method: "POST", path, timestamp, idempotencyKey, body: raw }),
  );
  return fetch(`${harness.running.url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "Request-Id": randomUUID(),
      Signature: signatureHeader(signature),
      Timestamp: timestamp,
      "API-Version": API_VERSION,
    },
    body: mutate(raw),
  });
}

function retrieveBody(query: string): Readonly<Record<string, unknown>> {
  return {
    query,
    action_class: "chat",
    limit: 5,
    as_of: null,
    user_id: harness.crypto.issuerFor("user"),
    tenant_id: TENANT,
  };
}

describe("ACP Signature — the buyer agent's JWS encoding", () => {
  it("is admitted by the gateway's own middleware", async () => {
    const response = await post(
      "/v1/memory/retrieve",
      retrieveBody("what do we know"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("fails closed when the body is altered after signing", async () => {
    const response = await post(
      "/v1/memory/retrieve",
      retrieveBody("what do we know"),
      () => JSON.stringify(retrieveBody("something else entirely")),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as {
      error: { reason_code: string };
    };
    expect(body.error.reason_code).toBe("SIGNATURE_INVALID");
  });
});
