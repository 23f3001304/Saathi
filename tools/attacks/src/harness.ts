import { randomUUID } from "node:crypto";

import { TrustRing } from "./crypto/trust-ring.js";
import type { HarnessEnv } from "./env.js";
import { loadHarnessEnv } from "./env.js";
import { AcpClient } from "./http/acp-client.js";

export interface Harness {
  readonly env: HarnessEnv;
  readonly ring: TrustRing;
  readonly client: AcpClient;
  readonly tenantId: string;
  readonly userIss: string;
  readonly merchantIss: string;
  readonly agentUrn: string;
}

export function createHarness(env: HarnessEnv = loadHarnessEnv()): Harness {
  const ring = TrustRing.load(env.keyDir);
  return {
    env,
    ring,
    client: new AcpClient(env.gatewayUrl, ring),
    tenantId: env.tenantId,
    userIss: ring.issuerFor("user"),
    merchantIss: ring.issuerFor("merchant"),
    agentUrn: `urn:covenant:agent:${randomUUID()}`,
  };
}

export interface Readiness {
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * The harness boots nothing. A demo that silently started its own gateway
 * would be proving something about a process the audience never saw; this
 * checks the one that is actually running and says so plainly if it is not.
 */
/**
 * The second half matters as much as the first: a gateway can be perfectly
 * ready and still be a *different* gateway from the one whose trust ring is on
 * disk. That mismatch shows up as 49 `SIGNATURE_INVALID`s halfway through a
 * demo, so it is caught here with one signed read instead.
 */
async function keysMatch(harness: Harness): Promise<Readiness> {
  const probe = await harness.client.post("/v1/memory/retrieve", {
    query: "readiness probe",
    action_class: "chat",
    limit: 1,
    as_of: null,
    user_id: harness.userIss,
    tenant_id: harness.tenantId,
  });
  if (probe.status === 200) {
    return { ok: true, detail: "" };
  }
  return {
    ok: false,
    detail: `signed probe answered HTTP ${probe.status}; COVENANT_KEY_DIR (${harness.env.keyDir}) is not the trust ring this gateway booted with`,
  };
}

export async function probeGateway(harness: Harness): Promise<Readiness> {
  try {
    const ready = await harness.client.get("/readyz");
    if (ready.status !== 200 || ready.body["ok"] !== true) {
      return { ok: false, detail: `HTTP ${ready.status} from /readyz` };
    }
    const keys = await keysMatch(harness);
    return keys.ok
      ? { ok: true, detail: JSON.stringify(ready.body["checks"]) }
      : keys;
  } catch (cause) {
    return {
      ok: false,
      detail: `${harness.env.gatewayUrl} unreachable: ${
        cause instanceof Error ? cause.message : "unknown error"
      }`,
    };
  }
}
