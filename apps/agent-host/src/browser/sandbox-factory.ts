import { createHash } from "node:crypto";
import {
  BrowserSession,
  PersistentSandboxFactory,
  CartCovenant,
  CartInspector,
  DEFAULT_HANDOFF_CONFIG,
  FieldClassifier,
  fixtureShopRoot,
  Journal,
  NavigationPolicy,
  TimerWaiter,
} from "@covenant/browser-drive";
import type { JournalSink } from "@covenant/browser-drive";
import type { Clock, Logger } from "@covenant/domain";

import { resolvePlan } from "./sandbox-plan.js";
import type { SandboxPlan } from "./sandbox-plan.js";
import { SANDBOX_WINDOW } from "./sandbox-window.js";

export { SANDBOX_WINDOW } from "./sandbox-window.js";

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
    // Persistent on purpose: the profile is the shopper's working state -
    // the Amazon sign-in, the basket cookies - and it survives window
    // retirement and host restarts alike. Only `purgeSandboxProfile`
    // (deleting the chat, or the Forget button) removes it.
    sandboxes: sandboxStore(),
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

const SANDBOX_ROOT = "./data/sandboxes";
let store: PersistentSandboxFactory | null = null;

function sandboxStore(): PersistentSandboxFactory {
  store = store ?? new PersistentSandboxFactory(SANDBOX_ROOT);
  return store;
}

/** The one deliberate deletion path for a window's cookies and storage. */
export function purgeSandboxProfile(sessionId: string): void {
  sandboxStore().purge(sessionId);
}

/** Stable per conversation, opaque to the client: conversation strings are
 *  client-chosen and reach container names, so the id is a hash of one,
 *  never the string itself. The same chat reopens the same profile. */
export function windowIdFor(conversation: string): string {
  const digest = createHash("sha256").update(conversation).digest("hex");
  return `web_${digest.slice(0, 24)}`;
}

