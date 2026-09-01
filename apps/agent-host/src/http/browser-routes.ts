import type { Logger } from "@covenant/domain";
import type { Hono } from "hono";

import type { BrowserRegistry } from "../browser/browser-registry.js";
import type { AppEnv } from "./app-env.js";
import { browserKeyGuard, HANDSHAKE_PATH } from "./browser-key.js";
import { registerSessions } from "./session-routes.js";
import type { SessionKeys } from "./session-keys.js";
import { registerWindow, type ResolveWindow } from "./window-routes.js";

export { payloadOf } from "./frame-stream.js";

/** The per-session routes authenticate themselves; the host key is not theirs. */
const SELF_GUARDED = ["/browser/sessions"];

export interface BrowserRoutes {
  readonly registry: BrowserRegistry;
  readonly keys: SessionKeys;
  readonly logger: Logger;
  readonly hostKey: string;
  /** Which agent window a `/browser/*` call means: the primary, or — with
   *  `?conversation=` — that lane's own. Absent, the primary serves alone. */
  readonly resolveWindow?: ResolveWindow;
}

/**
 * The sandbox surface, split the way control is split.
 *
 * Two families of route, and the difference between them is the whole of this
 * change. `/browser/*` is the window the agent's own tools drive: one window,
 * behind the host key, exactly as it always was. `/browser/sessions/*` is
 * every other window on this host, each behind a key minted for it alone.
 *
 * DECISION: the primary window keeps the host key rather than being folded
 * into the registry. It is not a session anyone requested — it is the one the
 * buyer agent opens through `covenant_web` — so there is no caller to hand a
 * session key to, and inventing one would mean the agent authenticating to
 * its own host. What it is not is a way into the others: the host key opens
 * this window and the queue, and reaches no session in the registry.
 */
export function registerBrowser(
  app: Hono<AppEnv>,
  routes: BrowserRoutes,
): void {
  app.use(
    "/browser/*",
    browserKeyGuard(routes.hostKey, routes.logger, SELF_GUARDED),
  );
  // The one route that hands the key out, and the only one that does not need
  // it. Its CORS is scoped in `buildServer`; everything else here stays `*`.
  app.get(HANDSHAKE_PATH, (context) =>
    context.json({ ok: true, key: routes.hostKey }, 200),
  );
  registerWindow(
    app,
    "/browser",
    routes.resolveWindow ??
      (() => ({
        id: "primary",
        service: routes.registry.primary(),
        openedAt: 0,
      })),
    routes.logger,
  );
  registerSessions(app, routes);
}
