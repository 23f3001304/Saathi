import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunningGateway } from "@covenant/gateway-svc";
import {
  loadConfig as loadGatewayConfig,
  startGateway,
} from "@covenant/gateway-svc";

import { loadConfig } from "../../src/config.js";
import type { RunningAgentHost } from "../../src/server-runtime.js";
import { startAgentHost } from "../../src/server-runtime.js";

export const TENANT = "tnt_demo";

export const CAP_PAISE = 250_000;

export const API_VERSION = "2026-08-31";

export interface Harness {
  readonly gateway: RunningGateway;
  readonly host: RunningAgentHost;
  readonly dir: string;
}

/**
 * Both real servers, on ephemeral ports, against a temp database and a trust
 * ring the gateway mints at boot. Nothing is mocked: the agent signs with the
 * same ES256 keys the gateway verifies against, and every call between them
 * crosses a socket.
 *
 * Order is load-bearing — agent-host refuses to start without a trust ring on
 * disk, and the gateway is the only process allowed to mint one.
 */
export async function boot(): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "covenant-agent-e2e-"));
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
    loadConfig({
      PORT: "0",
      COVENANT_GATEWAY_URL: gateway.url,
      COVENANT_DB: join(dir, "covenant.db"),
      COVENANT_KEY_DIR: join(dir, "keys"),
      COVENANT_TENANT: TENANT,
      COVENANT_AGENT_MODE: "scripted",
      COVENANT_AGENT_CAP_PAISE: String(CAP_PAISE),
      COVENANT_AGENT_AUTOSIGN: "true",
      LOG_LEVEL: "fatal",
    }),
  );
  return { gateway, host, dir };
}

export async function teardown(harness: Harness): Promise<void> {
  await harness.host.shutdown("SIGTERM");
  await harness.gateway.shutdown("SIGTERM");
  try {
    rmSync(harness.dir, { recursive: true, force: true });
  } catch {
    // Windows can hold the WAL file a moment after close; the OS reaps temp.
  }
}

/** The gateway's read routes want `Request-Id` + `API-Version` and nothing else. */
export function readHeaders(): Record<string, string> {
  return { "Request-Id": randomUUID(), "API-Version": API_VERSION };
}

export async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: readHeaders() });
  return (await response.json()) as unknown;
}
