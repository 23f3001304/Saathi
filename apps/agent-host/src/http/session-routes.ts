import type { Logger } from "@covenant/domain";
import type { Hono } from "hono";

import type {
  BrowserRegistry,
  SessionHandle,
} from "../browser/browser-registry.js";
import type { AppContext, AppEnv } from "./app-env.js";
import { BROWSER_KEY_REFUSED, offeredKey } from "./browser-key.js";
import { registerWindow } from "./window-routes.js";
import {
  NO_SUCH_SESSION,
  NOT_YOUR_SESSION,
  type SessionKeys,
} from "./session-keys.js";

export interface SessionParts {
  readonly registry: BrowserRegistry;
  readonly keys: SessionKeys;
  readonly logger: Logger;
  /** Authorises opening a sandbox at all; never reaches an existing one. */
  readonly hostKey: string;
}

/**
 * Resolve the window this call names, and prove the caller owns it.
 *
 * The order matters and is the whole point. The session is looked up first, so
 * an unknown id is a 404 whatever key was offered; then the key is checked
 * against *that* session. A caller holding session A's key and naming session
 * B gets a 403 that says which mistake it made, and never touches B.
 */
function resolve(
  context: AppContext,
  parts: SessionParts,
): SessionHandle | Response {
  const id = context.req.param("id") ?? "";
  const handle = parts.registry.get(id);
  const offered = offeredKey(context);
  if (handle === null) {
    return context.json(NO_SUCH_SESSION, 404);
  }
  if (parts.keys.matches(id, offered)) {
    return handle;
  }
  const held = parts.keys.sessionFor(offered);
  parts.logger.warn("browser.session.refused", {
    asked: id,
    held,
    path: context.req.path,
  });
  return context.json(
    held === null ? BROWSER_KEY_REFUSED : NOT_YOUR_SESSION,
    held === null ? 401 : 403,
  );
}

function hostKeyOk(context: AppContext, parts: SessionParts): boolean {
  const offered = offeredKey(context);
  return offered !== null && offered === parts.hostKey;
}

/** Asking for a window, and being told where you stand if there is none. */
function registerOpen(app: Hono<AppEnv>, parts: SessionParts): void {
  app.post("/browser/sessions", (context) => {
    if (!hostKeyOk(context, parts)) {
      return context.json(BROWSER_KEY_REFUSED, 401);
    }
    const outcome = parts.registry.start();
    if (outcome.kind === "refused") {
      return context.json(
        { ok: false, reason_code: "AT_CAPACITY", ...outcome },
        503,
      );
    }
    if (outcome.kind === "queued") {
      return context.json({ ok: true, ...outcome }, 202);
    }
    return context.json({ ok: true, ...outcome }, 201);
  });

  app.get("/browser/sessions/queue/:ticket", (context) => {
    if (!hostKeyOk(context, parts)) {
      return context.json(BROWSER_KEY_REFUSED, 401);
    }
    const outcome = parts.registry.claim(context.req.param("ticket") ?? "");
    return context.json({ ok: outcome.kind !== "refused", ...outcome }, 200);
  });
}

/** Listing what is open, and letting one go. */
function registerRoster(app: Hono<AppEnv>, parts: SessionParts): void {
  app.get("/browser/sessions", (context) => {
    if (!hostKeyOk(context, parts)) {
      return context.json(BROWSER_KEY_REFUSED, 401);
    }
    return context.json(
      {
        ok: true,
        open: parts.registry.list(),
        waiting: parts.registry.waiting,
        cap: parts.registry.cap,
      },
      200,
    );
  });

  app.delete("/browser/sessions/:id", async (context) => {
    const found = resolve(context, parts);
    if (found instanceof Response) return found;
    parts.keys.forget(found.id);
    await parts.registry.close(found.id);
    return context.json({ ok: true }, 200);
  });
}

/**
 * Every sandbox on this host, each behind its own key.
 *
 * The window routes are registered once and given a resolver rather than a
 * service, so there is exactly one implementation of "look at the window" and
 * "drive the window" and it cannot be reached without going through the check
 * above. The single-window routes are the same handlers over a fixed session.
 */
export function registerSessions(app: Hono<AppEnv>, parts: SessionParts): void {
  registerOpen(app, parts);
  registerRoster(app, parts);
  registerWindow(
    app,
    "/browser/sessions/:id",
    (context) => resolve(context, parts),
    parts.logger,
  );
}
