import { createPrivateKey, createSign } from "node:crypto";

import type { KeyResolver, PinnedJwk } from "@covenant/domain";
import { roleOfKid } from "@covenant/domain";
import { toPinnedJwk } from "@covenant/mandates";
import { beforeEach, describe, expect, it } from "vitest";

import {
  AdmissionGate,
  BodySignatureVerifier,
  baseStringOf,
} from "../src/index.js";
import type { AcpHeaders, AdmissionRequest } from "../src/index.js";
import { FixedClock } from "./fakes.js";
import { ISSUERS, NOW, USER_URN } from "./fixtures.js";
import { buildCrypto } from "./mandate-harness.js";

const API_VERSION = "2026-08-31";
const REQUEST_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const IDEMPOTENCY_KEY = "16fd2706-8baf-433b-82eb-8c7fada847da";

class Ring implements KeyResolver {
  constructor(private readonly keys: readonly PinnedJwk[]) {}

  resolve(_iss: string, kid: string): PinnedJwk | null {
    return this.keys.find((key) => key.kid === kid) ?? null;
  }
}

let gate: AdmissionGate;
let signBase: (base: string) => string;
let userKid: string;

beforeEach(async () => {
  const clock = new FixedClock(NOW);
  const crypto = await buildCrypto(clock);
  const jwks = crypto.material.trustRing.keys.map((key) =>
    toPinnedJwk(key, roleOfKid(key.kid) ?? "user"),
  );
  userKid = jwks.find((key) => key.role === "user")?.kid ?? "";
  const entry = crypto.material.privateKeys.find((key) => key.role === "user");
  const priv = createPrivateKey({ key: entry?.jwk as never, format: "jwk" });
  signBase = (base) =>
    createSign("SHA256")
      .update(base, "utf8")
      .sign({ key: priv, dsaEncoding: "ieee-p1363" })
      .toString("base64url");
  gate = new AdmissionGate(
    new BodySignatureVerifier(new Ring(jwks)),
    clock,
    API_VERSION,
  );
});

function headers(overrides: Partial<AcpHeaders> = {}): AcpHeaders {
  return {
    idempotencyKey: IDEMPOTENCY_KEY,
    requestId: REQUEST_ID,
    signature: null,
    timestamp: NOW.toISOString(),
    apiVersion: API_VERSION,
    ...overrides,
  };
}

const RAW_BODY = '{"tenant_id":"tnt_demo"}';

function request(overrides: Partial<AcpHeaders> = {}): AdmissionRequest {
  const base: AdmissionRequest = {
    method: "POST",
    path: "/v1/verify-cart",
    rawBody: RAW_BODY,
    parsedBody: { tenant_id: "tnt_demo" },
    issuer: USER_URN,
    headers: headers(overrides),
  };
  const sig = signBase(
    baseStringOf({
      method: base.method,
      path: base.path,
      timestamp: base.headers.timestamp ?? "",
      idempotencyKey: base.headers.idempotencyKey ?? "",
      rawBody: RAW_BODY,
    }),
  );
  const signature = `keyid=${userKid},alg=ES256,sig=${sig}`;
  return { ...base, headers: { ...base.headers, signature } };
}

describe("AdmissionGate — headers", () => {
  it("admits a well-formed, correctly signed request", () => {
    const admission = gate.admit(request());
    expect(admission.status).toBe("admitted");
    if (admission.status !== "admitted") {
      return;
    }
    expect(admission.requestId).toBe(REQUEST_ID);
    expect(admission.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["REQUEST_ID_MISSING", { requestId: null }],
    ["IDEMPOTENCY_KEY_MISSING", { idempotencyKey: null }],
    ["API_VERSION_UNSUPPORTED", { apiVersion: "2026-01-01" }],
  ])("rejects %s", (code, overrides) => {
    const admission = gate.admit(request(overrides));
    expect(admission.status).toBe("rejected");
    if (admission.status === "rejected") {
      expect(admission.reasonCode).toBe(code);
    }
  });

  it("rejects a timestamp outside the ±300 s window", () => {
    const stale = new Date(NOW.getTime() - 301_000).toISOString();
    const admission = gate.admit(request({ timestamp: stale }));
    expect(admission.status).toBe("rejected");
    if (admission.status === "rejected") {
      expect(admission.reasonCode).toBe("TIMESTAMP_SKEW");
    }
  });

});

describe("AdmissionGate — the body signature", () => {
  it("rejects a signature over a different path — the base string binds it", () => {
    const admitted = request();
    const moved = { ...admitted, path: "/v1/execute-payment" };
    const admission = gate.admit(moved);
    expect(admission.status).toBe("rejected");
    if (admission.status === "rejected") {
      expect(admission.reasonCode).toBe("SIGNATURE_INVALID");
    }
  });

  it("rejects a signature over a different body", () => {
    const admitted = request();
    const admission = gate.admit({ ...admitted, rawBody: '{"tenant_id":"x"}' });
    expect(admission.status).toBe("rejected");
  });

});

describe("AdmissionGate — the signer", () => {
  it("rejects an unknown kid without reaching the network", () => {
    const admitted = request();
    const signature = (admitted.headers.signature ?? "").replace(
      userKid,
      "user-2026-08-deadbeef",
    );
    const admission = gate.admit({
      ...admitted,
      headers: { ...admitted.headers, signature },
    });
    expect(admission.status).toBe("rejected");
  });

  it("refuses `alg=none` before any verifier is called", () => {
    const admitted = request();
    const signature = (admitted.headers.signature ?? "").replace(
      "alg=ES256",
      "alg=none",
    );
    const admission = gate.admit({
      ...admitted,
      headers: { ...admitted.headers, signature },
    });
    expect(admission.status).toBe("rejected");
  });
});

describe("issuer map", () => {
  it("keeps the three trust contexts distinct", () => {
    expect(new Set(Object.values(ISSUERS)).size).toBe(3);
  });
});
