import type { AddressInfo } from "node:net";

import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";

import type { CompositionRoot } from "./composition-root.js";
import { buildRoot } from "./composition-root.js";
import type { GatewayConfig } from "./config.js";
import { buildServer } from "./http/server.js";
import { GracefulShutdown } from "./shutdown.js";

/** Keeps `/folds/*` current without putting a fold pass on the money path. */
const FOLD_INTERVAL_MS = 5_000;

export interface RunningGateway {
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

function materialize(root: CompositionRoot): void {
  try {
    root.stores.ledger.run("fold.materialize", () =>
      root.folds.runner.runPending(),
    );
  } catch (cause) {
    root.obs.logger.error("fold.materialize.failed", {
      cause: cause instanceof Error ? cause.message : "unknown",
    });
  }
}

function stepsFor(root: CompositionRoot, server: ServerType, folds: NodeJS.Timeout) {
  return {
    stopAccepting: () =>
      new Promise<void>((resolve) => {
        clearInterval(folds);
        server.close(() => {
          resolve();
        });
      }),
    closeStreams: () => root.stores.hub.closeAll(),
    flushTraces: () => root.obs.otel.shutdown(),
    closeDatabase: () => {
      // Both handles: a live read-only connection keeps the WAL files open.
      root.stores.readDb.close();
      root.stores.db.close();
    },
  };
}

/**
 * Boot order (ARCHITECTURE §10.4): assemble → materialise folds → rearm every
 * pending cool-off hold → only then report ready. A restart that silently
 * dropped a hold would let a parked purchase execute unbounded, so `readyz`
 * stays 503 until `rebuild()` has armed one timer per `pending_cooloff` row.
 */
export async function startGateway(
  config: GatewayConfig,
): Promise<RunningGateway> {
  const root = await buildRoot(config);
  materialize(root);
  const holds = root.services.cooloff.rebuild();
  root.read.readiness.markRearmed();
  const server = serve({ fetch: buildServer(root).fetch, port: config.port });
  const folds = setInterval(() => materialize(root), FOLD_INTERVAL_MS);
  folds.unref();
  const port = portOf(server, config.port);
  const shutdown = new GracefulShutdown(
    root.drain,
    stepsFor(root, server, folds),
    root.obs.logger,
  );
  root.obs.logger.info("boot.ready", {
    readyz_checks: root.read.readiness.check().checks,
    schema_version: 1,
    head_seq: root.stores.reader.height(),
    holds_rearmed: holds,
    port,
    rail: config.rail,
  });
  return {
    root,
    port,
    url: `http://127.0.0.1:${port}`,
    shutdown: (signal) => shutdown.run(signal),
  };
}
