import type { Logger } from "@covenant/domain";

import type {
  BrowserLauncher,
  LaunchedBrowser,
  LaunchRequest,
} from "../ports.js";
import { assertSurface } from "../surface.js";
import { ContainerLauncher } from "./container-launcher.js";
import type { ConnectedBrowser } from "./container-launcher.js";
import type { ContainerLauncherConfig } from "./container-spec.js";
import { WarmContainers, warmSessionId } from "./warm-pool.js";

/** See `WARM_READER_MAX_AGE_MS`: a claimed window must have its full lifetime. */
export const WARM_WINDOW_MAX_AGE_MS = 300_000;

export type WindowContainerConfig = Omit<ContainerLauncherConfig, "sessionId">;

/**
 * Purchase windows started before a shopper asks for one.
 *
 * DECISION: a warm container is **blank** and is bound to one conversation on
 * first use, never shared and never recycled. That is what keeps two shoppers
 * apart: the container a conversation is given has loaded no page, holds no
 * cookie and no sign-in, and once it has driven anything the only thing that
 * happens to it is that it ends. Sharing one browser between shoppers would be
 * the failure this whole package exists to prevent, and no code path here can
 * express it - `claim` removes the entry from the pool for good.
 *
 * On the container surface this costs nothing that was not already lost: the
 * profile is a tmpfs inside the container (`run-args.ts`) and no host directory
 * is mounted, so a conversation's cookies have never outlived its container.
 */
export class WarmWindows {
  private readonly pool: WarmContainers<ConnectedBrowser>;

  constructor(
    private readonly config: WindowContainerConfig,
    /** The one shape a warm window is started in; anything else launches cold. */
    private readonly template: LaunchRequest,
    size: number,
    logger?: Logger,
  ) {
    this.pool = new WarmContainers({
      size,
      maxAgeMs: WARM_WINDOW_MAX_AGE_MS,
      start: () => this.cold(warmSessionId()).launch(this.template),
      retire: (held) => held.close(),
      ...(logger === undefined ? {} : { logger }),
      label: "window",
    });
  }

  prime(): void {
    this.pool.prime();
  }

  get ready(): number {
    return this.pool.ready;
  }

  /** The launcher one session gets. It claims at most one container, ever. */
  launcherFor(sessionId: string): BrowserLauncher {
    return { launch: (request) => this.launch(sessionId, request) };
  }

  drain(): Promise<void> {
    return this.pool.drain();
  }

  /**
   * A request the pool was not primed for is launched cold rather than served
   * warm. Viewport is not a detail here: the frame stream and every relayed
   * coordinate are in those pixels, so handing back a window of the wrong size
   * would move every click the shopper made.
   */
  private launch(
    sessionId: string,
    request: LaunchRequest,
  ): Promise<LaunchedBrowser> {
    assertSurface(request.surface, "container");
    if (!sameShape(request, this.template)) {
      return this.cold(sessionId).launch(request);
    }
    return this.pool.claim();
  }

  private cold(sessionId: string): ContainerLauncher {
    return new ContainerLauncher({ ...this.config, sessionId });
  }
}

function sameShape(asked: LaunchRequest, warm: LaunchRequest): boolean {
  return (
    asked.windowWidth === warm.windowWidth &&
    asked.windowHeight === warm.windowHeight
  );
}
