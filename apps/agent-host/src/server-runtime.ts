import type { AddressInfo } from "node:net";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";

import type { CompositionRoot } from "./composition-root.js";
import { buildRoot } from "./composition-root.js";
import type { AgentHostConfig } from "./config.js";
import type { ServerDeps } from "./http/server.js";
import { buildServer } from "./http/server.js";
import { GracefulShutdown } from "./shutdown.js";

/** A wedged model turn must not hold the process open past this. */
const DRAIN_TIMEOUT_MS = 20_000;

export interface RunningAgentHost {
  readonly root: CompositionRoot;
  readonly port: number;
  readonly url: string;
  shutdown(signal: string): Promise<void>;
}

function portOf(server: ServerType, fallback: number): number {
  const address = server.address();
  return address === null || typeof address === "string"
    ? fallback
    : (address as AddressInfo).port;
}

function stepsFor(root: CompositionRoot, server: ServerType) {
  return {
    stopAccepting: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
    settleRun: async () => {
      await root.chat.settled();
    },
    closeStreams: () => {
      root.hub.closeAll();
      root.beatLog.close();
      root.contextLog.close();
    },
    closeSession: async () => {
      // Every window, not just the agent's: a host that exits leaving other
      // sessions' containers running is the orphan problem it reaps at boot.
      await root.browserRegistry.closeAll();
      await root.session.close();
    },
  };
}

function depsFor(
  config: AgentHostConfig,
  root: CompositionRoot,
  shutdownRef: { current: GracefulShutdown | null },
): ServerDeps {
  return {
    config,
    chat: root.chat,
    conversation: root.buyer.conversation,
    hub: root.hub,
    beats: root.beats,
    browser: root.browser,
    browserRegistry: root.browserRegistry,
    browserKeys: root.browserKeys,
    amend: root.amend,
    logger: root.obs.logger,
    store: root.obs.store,
    clock: root.clock,
    ids: root.ids,
    draining: () => shutdownRef.current?.draining ?? false,
  };
}

/**
 * Assemble, then listen. Nothing is deferred to the first request: the trust
 * ring is read, both signers are built and the session is constructed at boot,
 * so a misconfigured host is a dead process with a readable message rather than
 * one that accepts a purchase and then discovers it cannot sign for it.
 *
 * The beat socket's upgrade handler is attached after `serve()` because it
 * needs the `node:http` server itself, which Hono's fetch handler never sees.
 */
export function startAgentHost(config: AgentHostConfig): RunningAgentHost {
  const root = buildRoot(config);
  const shutdownRef: { current: GracefulShutdown | null } = { current: null };
  const built = buildServer(depsFor(config, root, shutdownRef));
  const server = serve({ fetch: built.app.fetch, port: config.port });
  built.injectWebSocket(server);
  const shutdown = new GracefulShutdown(
    stepsFor(root, server),
    root.obs.logger,
    DRAIN_TIMEOUT_MS,
  );
  shutdownRef.current = shutdown;
  const port = portOf(server, config.port);
  root.obs.logger.info("boot.ready", {
    port,
    mode: config.mode,
    gateway_url: config.gatewayUrl,
    user_iss: root.keys.userIss,
    merchant_iss: root.keys.merchantIss,
    agent_instance_id: root.identity.instance.instanceId,
  });
  return {
    root,
    port,
    url: `http://127.0.0.1:${port}`,
    shutdown: (signal) => shutdown.run(signal),
  };
}
