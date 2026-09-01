// Both real servers, on ephemeral ports, against a temp database and a trust
// ring the gateway mints at boot — the same shape `apps/agent-host/tests` uses.
// Nothing is mocked: the UI transport under test talks to agent-host over a
// socket, and agent-host talks to the gateway over another one.
//
// DECISION: the servers are imported by relative path rather than by package
// name. Why: `apps/audit-ui` must not gain a workspace dependency on either
// app (it would put both into the UI's build graph and rewrite the root
// lockfile), and the thing under test is the HTTP contract, not the module.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadConfig as loadGatewayConfig,
  startGateway,
} from "../../../gateway-svc/src/index.js";
import {
  loadConfig as loadHostConfig,
  startAgentHost,
} from "../../../agent-host/src/index.js";

export const TENANT = "tnt_demo";

/** Matched to the ceiling the test sentence asks for, so the bill is honest. */
export const CAP_PAISE = 200_000;

export interface LiveHarness {
  readonly gatewayUrl: string;
  readonly hostUrl: string;
  shutdown: () => Promise<void>;
}

/**
 * Order is load-bearing: agent-host refuses to start without a trust ring on
 * disk, and the gateway is the only process allowed to mint one.
 */
export async function boot(): Promise<LiveHarness> {
  const dir = mkdtempSync(join(tmpdir(), "covenant-ui-live-"));
  const gateway = await startGateway(
    loadGatewayConfig({
      PORT: "0",
      COVENANT_DB: join(dir, "covenant.db"),
      COVENANT_KEY_DIR: join(dir, "keys"),
      COVENANT_RAIL: "fake",
      COVENANT_TENANT: TENANT,
      LOG_LEVEL: "fatal",
    }),
  );
  const host = startAgentHost(
    loadHostConfig({
      PORT: "0",
      COVENANT_GATEWAY_URL: gateway.url,
      COVENANT_KEY_DIR: join(dir, "keys"),
      COVENANT_TENANT: TENANT,
      COVENANT_AGENT_MODE: "scripted",
      COVENANT_AGENT_CAP_PAISE: String(CAP_PAISE),
      // The whole point: the run must stop at both gates and wait for the UI
      // to release them, exactly as a browser would.
      COVENANT_AGENT_AUTOSIGN: "false",
      LOG_LEVEL: "fatal",
    }),
  );
  return {
    gatewayUrl: gateway.url,
    hostUrl: host.url,
    shutdown: async () => {
      await host.shutdown("SIGTERM");
      await gateway.shutdown("SIGTERM");
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows can hold the WAL file a moment after close; the OS reaps temp.
      }
    },
  };
}

const POLL_MS = 25;

/** Fails with what it was waiting for, never with a bare timeout. */
export async function waitFor(
  label: string,
  predicate: () => boolean,
  timeoutMs = 60_000,
  beforeEach?: () => Promise<void>,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await beforeEach?.();
    if (predicate()) return;
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

export async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as unknown;
}

async function post(url: string, body?: unknown): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function awaiting(harness: LiveHarness): Promise<readonly string[]> {
  const state = (await getJson(`${harness.hostUrl}/chat/state`)) as {
    awaiting?: readonly string[];
  };
  return state.awaiting ?? [];
}

async function release(harness: LiveHarness, gate: string): Promise<void> {
  let open: readonly string[] = [];
  await waitFor(
    `the ${gate} gate`,
    () => open.includes(gate),
    60_000,
    async () => {
      open = await awaiting(harness);
    },
  );
  await post(`${harness.hostUrl}/chat/${gate}/sign`);
}

/**
 * One purchase over the plain HTTP surface, both gates released the way the
 * Bench releases them. Used by the suites that care about what the run wrote
 * to the ledger rather than about how the conversation rendered.
 */
export async function runPurchase(
  harness: LiveHarness,
  request: string,
): Promise<void> {
  const started = await post(`${harness.hostUrl}/chat`, { message: request });
  if (!started.ok) throw new Error(`POST /chat → ${started.status}`);
  await release(harness, "intent");
  await release(harness, "cart");
  // Signing the cart only unblocks settlement; the frames the ledger suites
  // read are written after it, so the run is not done until it says so.
  let settled = false;
  await waitFor(
    "the run to settle",
    () => settled,
    60_000,
    async () => {
      settled = await hasOutcome(harness);
    },
  );
}

async function hasOutcome(harness: LiveHarness): Promise<boolean> {
  const state = (await getJson(`${harness.hostUrl}/chat/state`)) as {
    beats?: readonly { kind?: string }[];
  };
  return (state.beats ?? []).some((beat) => beat.kind === "outcome");
}
