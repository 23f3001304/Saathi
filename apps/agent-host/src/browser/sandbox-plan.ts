import {
  ContainerLauncher,
  ContainerReaderBrowser,
  dockerSandboxReady,
  NativeReaderBrowser,
  PuppeteerLauncher,
  reapOrphans,
  seccompProfilePath,
  WarmReaderBrowsers,
  WarmWindows,
} from "@covenant/browser-drive";
import type {
  BrowserLauncher,
  LaunchRequest,
  ReaderBrowser,
  SessionSurface,
} from "@covenant/browser-drive";
import type { Logger } from "@covenant/domain";

import { SANDBOX_WINDOW } from "./sandbox-window.js";
import { NO_WARM, warmSizesFrom } from "./warm-size.js";
import type { WarmSizes } from "./warm-size.js";

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
  /** Starts filling the warm pools. A no-op on a plan that keeps none. */
  readonly primeWarm: () => void;
  /** Ends every container still waiting unclaimed. Shutdown calls it. */
  readonly drainWarm: () => Promise<void>;
}

/** The launch a warm purchase window is started in. It must match what
 *  `BrowserSession` asks for, or the pool is primed for a shape nobody wants
 *  and every claim falls through to a cold start. */
export function windowLaunchTemplate(): LaunchRequest {
  return {
    // Both ignored inside a container: the profile is a tmpfs at a fixed path
    // and downloads are denied outright. Stated because `LaunchRequest` is the
    // native surface's type too, where they are neither.
    userDataDir: "",
    downloadDir: "",
    surface: "container",
    windowWidth: SANDBOX_WINDOW.width,
    windowHeight: SANDBOX_WINDOW.height,
  };
}


/** The container half of the two plans, exported so the surface a reader gets
 *  can be asserted on a machine with no Docker daemon to probe. */
export function containerPlan(
  why: string,
  warm: WarmSizes = NO_WARM,
  logger?: Logger,
): SandboxPlan {
  const config = {
    image: SANDBOX_IMAGE,
    seccompProfile: seccompProfilePath(),
    memoryMb: CONTAINER_MEMORY_MB,
    ttlSeconds: CONTAINER_TTL_SECONDS,
  };
  const readers =
    warm.readers > 0
      ? new WarmReaderBrowsers(config, warm.readers, logger)
      : null;
  const windows =
    warm.windows > 0
      ? new WarmWindows(config, windowLaunchTemplate(), warm.windows, logger)
      : null;
  return {
    surface: "container",
    why,
    launcherFor: (sessionId) =>
      windows?.launcherFor(sessionId) ??
      new ContainerLauncher({ ...config, sessionId }),
    readerBrowser: () => readers?.surface() ?? new ContainerReaderBrowser(config),
    primeWarm: () => {
      readers?.prime();
      windows?.prime();
    },
    drainWarm: async () => {
      await Promise.all([readers?.drain(), windows?.drain()]);
    },
  };
}

export function inProcessPlan(why: string): SandboxPlan {
  return {
    surface: "native-window",
    why,
    launcherFor: () => new PuppeteerLauncher(),
    readerBrowser: () => new NativeReaderBrowser(),
    // Nothing is kept warm on this surface: a pre-launched Chrome here would
    // be a browser idling on the operator's own machine, which is the exact
    // thing the container surface exists to avoid.
    primeWarm: () => undefined,
    drainWarm: () => Promise.resolve(),
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
  // Resolved once, at boot, so this is where "always warm" begins. Filling is
  // a background job: a pool that made boot wait for Chrome would trade the
  // cold start for a slower start, which is not the trade being asked for.
  chosen.primeWarm();
  // Both browsers this host opens, in one line: the window the shopper watches
  // and the reader the research errand batches through. Named separately
  // because "is there Chrome on this machine?" is a question about the reader
  // as much as the window, and a log that said only the window left it open.
  logger.info("browser.surface", {
    window: chosen.surface,
    reader: chosen.surface,
    why: chosen.why,
    warm: warmSizesFrom(env),
  });
  return chosen;
}

/**
 * DECISION: containers or nothing. The in-process window ran a real Chrome
 * on the shopper's own machine, and a checkout an agent drives is exactly
 * where "sandboxed by Chrome alone" stops being good enough. Falling back
 * silently also made the weaker surface the one that ran most often, since
 * it needed nothing installed. A missing Docker is now a startup error
 * naming what to install, not a quiet downgrade of the boundary.
 */
async function choosePlan(
  env: NodeJS.ProcessEnv,
  logger: Logger,
): Promise<SandboxPlan> {
  const missing = await dockerSandboxReady(SANDBOX_IMAGE);
  if (missing === null) {
    return containerPlan(
      "Docker is here and the sandbox image is built",
      warmSizesFrom(env),
      logger,
    );
  }
  logger.error("browser.sandbox.unavailable", { reason: missing });
  throw new Error(
    "This host opens purchase windows in a container and nowhere else, and " +
      `one cannot be started here: ${missing}. Start Docker and build the ` +
      "sandbox image, then start the host again.",
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
