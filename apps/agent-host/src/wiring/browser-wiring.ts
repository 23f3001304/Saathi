import type { Clock, IdGenerator } from "@covenant/domain";
import { cpus } from "node:os";

import { BrowserRegistry } from "../browser/browser-registry.js";
import { buildFixtureShopSession } from "../browser/sandbox-factory.js";
import { reapAbandonedSandboxes } from "../browser/sandbox-plan.js";
import { capFor, queueLimitFor } from "../browser/session-capacity.js";
import { warmReserved, warmSizesFrom } from "../browser/warm-size.js";
import type { AgentHostConfig } from "../config.js";
import type { SessionKeys } from "../http/session-keys.js";
import type { ObsParts } from "./obs-wiring.js";

/**
 * The sandbox window's owner. Built at boot like everything else, but nothing
 * is launched until `POST /browser/open` — a host that opened Chrome on start
 * would put a window on the operator's screen for a route nobody called.
 */
export function wireBrowserRegistry(
  config: AgentHostConfig,
  clock: Clock,
  ids: IdGenerator,
  obs: ObsParts,
  keys: SessionKeys,
): BrowserRegistry {
  // At boot, before any window opens: a container left by a previous process
  // that was killed rather than shut down is found by its label and destroyed.
  void reapAbandonedSandboxes(obs.logger);
  // Warm containers come out of the budget rather than sitting on top of it:
  // one that is waiting still holds its full memory entitlement, so a cap that
  // counted only claimed windows would promise the queue more than this host
  // can open. Never below one - a machine too small to keep anything warm must
  // still be able to open a window.
  const reserved = warmReserved(warmSizesFrom(process.env));
  const room = capFor({
    dockerMemMb: Number(process.env["COVENANT_DOCKER_MEM_MB"] ?? 8192),
    cpus: cpus().length,
  });
  const cap = Math.max(1, room - reserved);
  obs.logger.info("browser.capacity", {
    cap,
    queue: queueLimitFor(cap),
    warm_reserved: reserved,
  });
  return new BrowserRegistry({
    build: (sessionId) =>
      buildFixtureShopSession(
        { clock, logger: obs.logger, capPaise: config.capPaise },
        sessionId,
      ),
    ids,
    logger: obs.logger,
    cap,
    queueLimit: queueLimitFor(cap),
    mintKey: (sessionId) => keys.mint(sessionId),
  });
}
