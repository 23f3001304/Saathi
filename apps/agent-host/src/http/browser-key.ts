import type { Logger } from "@covenant/domain";
import type { MiddlewareHandler } from "hono";

import type { AppContext, AppEnv } from "./app-env.js";

export const BROWSER_KEY_HEADER = "X-Covenant-Browser-Key";

/**
 * Which window the caller believes it is driving. The key alone cannot say
 * that: it is minted once per agent-host boot and outlives any number of
 * sandbox sessions, so a tab left open across two errands would hold a
 * perfectly valid key for a container that no longer exists. This is the other
 * half of the binding — one key, but one window at a time, and the caller has
 * to name it.
 */
export const BROWSER_SESSION_HEADER = "X-Covenant-Browser-Session";

/**
 * `EventSource` cannot set a request header, so the frame stream carries the
 * key in the query string instead. That is a real, named weakness — a URL is
 * the one place a secret is likely to be logged — and it is preferred to the
 * alternative, which is leaving the one route that streams pictures of the
 * window as the only unauthenticated one.
 */
export const BROWSER_KEY_QUERY = "key";

export const BROWSER_KEY_REFUSED = {
  ok: false,
  reason_code: "BROWSER_KEY_REQUIRED",
  human:
    "This host refused the request: the sandbox routes need the session key agent-host minted at boot, and this call did not carry it. Nothing was opened and nothing was relayed.",
} as const;

/** The dev origins the UI is served from. Anything else must bring its own key. */
export const DEFAULT_UI_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

export const HANDSHAKE_PATH = "/browser/handshake";

/**
 * Constant-time enough for a boot-minted 256-bit value: the comparison is on
 * two strings of the same shape and the key does not survive the process.
 */
function matches(offered: string | null, key: string): boolean {
  return offered !== null && offered.length === key.length && offered === key;
}

export function offeredKey(context: AppContext): string | null {
  const header = context.req.header(BROWSER_KEY_HEADER);
  if (header !== undefined && header !== "") {
    return header;
  }
  const query = context.req.query(BROWSER_KEY_QUERY);
  return query === undefined || query === "" ? null : query;
}

/**
 * The gate on `/browser/*`. Everything except the handshake needs the key.
 *
 * DECISION: a shared secret rather than a session or a signature. agent-host
 * holds no user identity to authenticate *as*; what these routes need is proof
 * that the caller is the UI this host handed the key to, and not some other
 * page that happens to be open on the same machine. The key is minted at boot,
 * so the demo still runs with no configuration at all.
 */
export function browserKeyGuard(
  key: string,
  logger: Logger,
  /**
   * Paths that carry their own, stronger check. The per-session routes are
   * gated by the key minted for the window they name, which is not this key
   * — letting the host key through there would put every window back behind
   * one secret, which is the thing per-session keys exist to undo.
   */
  selfGuarded: readonly string[] = [],
): MiddlewareHandler<AppEnv> {
  return async (context, next) => {
    if (context.req.path === HANDSHAKE_PATH) {
      return await next();
    }
    if (selfGuarded.some((prefix) => context.req.path.startsWith(prefix))) {
      return await next();
    }
    if (matches(offeredKey(context), key)) {
      return await next();
    }
    logger.warn("browser.key.refused", {
      path: context.req.path,
      origin: context.req.header("origin") ?? null,
    });
    return context.json(BROWSER_KEY_REFUSED, 401);
  };
}

/**
 * Which origin may *read* the handshake. Everything else on this host stays
 * `*`: the point is not to lock down agent-host, it is that the one response
 * carrying the key must not be readable by any page that asks for it.
 *
 * A request with no `Origin` header is not a cross-origin browser request at
 * all (curl, or the host's own page), and CORS has nothing to say about it.
 */
export function handshakeOrigin(
  origin: string,
  allowed: readonly string[],
): string | null {
  if (origin === "") {
    return "*";
  }
  return allowed.includes(origin) ? origin : null;
}
