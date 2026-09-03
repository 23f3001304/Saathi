import {
  ContainerLauncher,
  ContainerReaderBrowser,
  dockerSandboxReady,
  NativeReaderBrowser,
  PuppeteerLauncher,
  reapOrphans,
  seccompProfilePath,
} from "@covenant/browser-drive";
import type {
  BrowserLauncher,
  ReaderBrowser,
  SessionSurface,
} from "@covenant/browser-drive";
import type { Logger } from "@covenant/domain";

export const SANDBOX_IMAGE = "covenant-browser-sandbox:latest";

/**
 * The ceiling, enforced inside the container by `timeout` rather than by a
 * timer here — a host that was `SIGKILL`ed cannot run a timer, so the host must
 * not be the thing holding the limit. Thirty minutes is the backstop; an errand
 * that finishes ends its container in seconds.
 */
export const CONTAINER_TTL_SECONDS = 1800;
export const CONTAINER_MEMORY_MB = 1024;

export type SandboxMode = "auto" | "container" | "in-process";

export interface SandboxPlan {
  readonly surface: SessionSurface;
  /** Why this surface, in one sentence the UI and the log can both show. */
  readonly why: string;
  readonly launcherFor: (sessionId: string) => BrowserLauncher;
  /** Where research reads happen. The same surface as the window, always: a
   *  container window beside a headless Chrome on the host would leave a
   *  browser on the very machine the container exists to keep clean. */
  readonly readerBrowser: () => ReaderBrowser;
}

function modeOf(raw: string | undefined): SandboxMode {
  if (raw === "container" || raw === "in-process") return raw;
  return "auto";
}

/** The container half of the two plans, exported so the surface a reader gets
 *  can be asserted on a machine with no Docker daemon to probe. */
export function containerPlan(why: string): SandboxPlan {
  const config = {
    image: SANDBOX_IMAGE,
    seccompProfile: seccompProfilePath(),
    memoryMb: CONTAINER_MEMORY_MB,
    ttlSeconds: CONTAINER_TTL_SECONDS,
  };
  return {
    surface: "container",
    why,
    launcherFor: (sessionId) => new ContainerLauncher({ ...config, sessionId }),
    readerBrowser: () => new ContainerReaderBrowser(config),
  };
}

export function inProcessPlan(why: string): SandboxPlan {
  return {
    surface: "native-window",
    why,
    launcherFor: () => new PuppeteerLauncher(),
    readerBrowser: () => new NativeReaderBrowser(),
  };
}

/**
 * Which sandbox this machine gets, decided once and said out loud.
 *
 * DECISION: `auto` probes rather than assumes, because the containerised path
 * is the hardened one and not the only one. A judge on a laptop with no Docker
 * Desktop gets the in-process window that has always worked, labelled as such
 * everywhere it shows — the same arrangement as the fixture floor elsewhere in
 * this repo. Asking for `container` explicitly fails loudly instead of falling
 * back: someone who asked for the boundary should be told they did not get it,
 * not quietly handed the weaker thing.
 */
export async function resolvePlan(
  env: NodeJS.ProcessEnv,
  logger: Logger,
): Promise<SandboxPlan> {
  const chosen = await choosePlan(env, logger);
  // Both browsers this host opens, in one line: the window the shopper watches
  // and the reader the research errand batches through. Named separately
  // because "is there Chrome on this machine?" is a question about the reader
  // as much as the window, and a log that said only the window left it open.
  logger.info("browser.surface", {
    window: chosen.surface,
    reader: chosen.surface,
    why: chosen.why,
  });
  return chosen;
}

async function choosePlan(
  env: NodeJS.ProcessEnv,
  logger: Logger,
): Promise<SandboxPlan> {
  const mode = modeOf(env["COVENANT_BROWSER_SANDBOX"]);
  if (mode === "in-process") {
    return inProcessPlan("COVENANT_BROWSER_SANDBOX=in-process was asked for");
  }
  const missing = await dockerSandboxReady(SANDBOX_IMAGE);
  if (missing === null) {
    return containerPlan("Docker is here and the sandbox image is built");
  }
  if (mode === "container") {
    throw new Error(
      `COVENANT_BROWSER_SANDBOX=container was asked for and cannot be honoured: ${missing}.`,
    );
  }
  logger.warn("browser.sandbox.in_process", { reason: missing });
  return inProcessPlan(
    `no containerised sandbox available here (${missing}). This window runs on your own machine instead.`,
  );
}

/**
 * Called once at boot. `docker run --rm` cleans up when its client exits
 * normally; an agent-host that was `SIGKILL`ed never exits at all, and the
 * daemon keeps that container alive until its own ceiling fires. Anything left
 * over from a previous process carries the sandbox label, so it can be found
 * and ended before this one opens a window of its own.
 */
export async function reapAbandonedSandboxes(logger: Logger): Promise<void> {
  try {
    const reaped = await reapOrphans();
    if (reaped.containers > 0 || reaped.networks > 0) {
      logger.warn("browser.sandbox.reaped", { ...reaped });
    }
  } catch (cause) {
    logger.warn("browser.sandbox.reap_failed", {
      cause: String(cause).slice(0, 200),
    });
  }
}
