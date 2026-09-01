import {
  BrowserSession,
  CartCovenant,
  CartInspector,
  DEFAULT_HANDOFF_CONFIG,
  FieldClassifier,
  fixtureShopRoot,
  Journal,
  NavigationPolicy,
  TimerWaiter,
  TmpSandboxFactory,
} from "@covenant/browser-drive";
import type { JournalSink } from "@covenant/browser-drive";
import type { Clock, Logger } from "@covenant/domain";

import { resolvePlan } from "./sandbox-plan.js";
import type { SandboxPlan } from "./sandbox-plan.js";

/**
 * Smaller than the package default. Every frame is decoded, painted and
 * re-encoded twice a second, and the cost of that is linear in pixels — a
 * window the user can read beats a window nobody can stream.
 */
export const SANDBOX_WINDOW = { width: 1024, height: 720 } as const;

export interface SandboxFactoryDeps {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly capPaise: number;
}

/** Forwards the browser trail into the host's log, one line per event. */
class LoggingSink implements JournalSink {
  constructor(private readonly logger: Logger) {}

  write(line: string): void {
    this.logger.info("browser.journal", { line });
  }
}

/**
 * A session scoped to the local fixture shop.
 *
 * DECISION: `fileRoots` is the fixture directory and `allowHosts` is empty
 * rather than "no hosts". An empty allowlist means unscoped http(s), which is
 * what a real merchant run needs; the demo simply never navigates there. What
 * the policy does close is the rest of the disk and every `chrome://` page, so
 * "open a sandbox against the fixture shop" cannot become "open the user's
 * documents" by passing a different string to the route.
 */
/**
 * Probed once per process. The answer cannot change while agent-host runs —
 * Docker appearing mid-session would not retroactively containerise a window
 * that is already open — so caching it keeps every session in one story about
 * where its browser is.
 */
let plan: Promise<SandboxPlan> | null = null;

export function sandboxPlan(logger: Logger): Promise<SandboxPlan> {
  plan ??= resolvePlan(process.env, logger);
  return plan;
}

export async function buildFixtureShopSession(
  deps: SandboxFactoryDeps,
  sessionId: string,
): Promise<BrowserSession> {
  const chosen = await sandboxPlan(deps.logger);
  return new BrowserSession({
    launcher: chosen.launcherFor(sessionId),
    sandboxes: new TmpSandboxFactory(),
    classifier: new FieldClassifier(),
    policy: new NavigationPolicy({
      fileRoots: [fixtureShopRoot(chosen.surface)],
      allowHosts: [],
      denyHosts: [],
    }),
    inspector: new CartInspector(),
    covenant: new CartCovenant({ capPaise: deps.capPaise, currency: "INR" }),
    journal: new Journal(new LoggingSink(deps.logger), deps.clock, sessionId),
    waiter: new TimerWaiter(),
    clock: deps.clock,
    config: {
      sessionId,
      surface: chosen.surface,
      windowWidth: SANDBOX_WINDOW.width,
      windowHeight: SANDBOX_WINDOW.height,
      handoff: DEFAULT_HANDOFF_CONFIG,
    },
  });
}
