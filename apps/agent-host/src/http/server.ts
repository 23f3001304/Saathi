import type { ServerType } from "@hono/node-server";
import type { MiddlewareHandler } from "hono";
import type { Clock, IdGenerator, Logger } from "@covenant/domain";
import { Hono } from "hono";
import { cors } from "hono/cors";

import type { AgentHostConfig } from "../config.js";
import type { BrowserService } from "../browser/browser-service.js";
import type { ContextStore } from "../obs/request-store.js";
import type { AmendFlow } from "../covenant/amend-flow.js";
import type { ConversationMemory } from "../purchase/conversation-memory.js";
import type { AppEnv } from "./app-env.js";
import type { BeatHub } from "./beat-hub.js";
import type { ConversationBeatStore } from "./beat-store.js";
import type { ChatService } from "./chat-service.js";
import { registerBeatSocket } from "./beat-socket.js";
import {
  BROWSER_KEY_HEADER,
  BROWSER_SESSION_HEADER,
  handshakeOrigin,
  HANDSHAKE_PATH,
} from "./browser-key.js";
import { registerBrowser } from "./browser-routes.js";
import { registerChat } from "./chat-routes.js";
import { registerCovenantAmend } from "./covenant-routes.js";
import type { BrowserRegistry } from "../browser/browser-registry.js";
import type { SessionKeys } from "./session-keys.js";
import { requestContext } from "./request-context.js";

export interface ServerDeps {
  readonly config: AgentHostConfig;
  readonly chat: ChatService;
  readonly conversation: ConversationMemory;
  readonly hub: BeatHub;
  readonly beats: ConversationBeatStore;
  readonly browser: BrowserService;
  readonly browserRegistry: BrowserRegistry;
  readonly browserKeys: SessionKeys;
  readonly amend: AmendFlow;
  readonly logger: Logger;
  readonly store: ContextStore;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly draining: () => boolean;
}

/**
 * The app plus the upgrade hook the beat socket needs. `injectWebSocket` binds
 * to the `node:http` server `serve()` returns, which only the caller has, so
 * the two are handed back together rather than wired here.
 */
export interface BuiltServer {
  readonly app: Hono<AppEnv>;
  readonly injectWebSocket: (server: ServerType) => void;
}

/**
 * DECISION: CORS is wide open on this service and only this service. Why: the
 * Bench is a separate origin (`:5173`) talking to the host (`:8788`), and
 * agent-host holds nothing a cross-origin caller could steal — no cookies, no
 * bearer tokens, no session. Everything that *is* sensitive lives behind the
 * gateway's ACP signature check, which a browser cannot forge from a stolen
 * origin because it never sees the private key.
 *
 * One exception, and only one: `GET /browser/handshake` hands out the sandbox
 * key, so it answers a named list of origins rather than `*`. Every other path
 * keeps exactly the policy it had — the carve-out is a branch on the path, not
 * a narrowing of the default.
 */
function corsFor(uiOrigins: readonly string[]): MiddlewareHandler<AppEnv> {
  return cors({
    origin: (origin, context) =>
      context.req.path === HANDSHAKE_PATH
        ? handshakeOrigin(origin, uiOrigins)
        : "*",
    // Both sandbox headers, or neither: the session header is added to every
    // call the moment the card learns which window it is watching, so leaving
    // it off this list failed the preflight for `/browser/state` from then on
    // — the card fell to the reel and stayed there while the host was serving
    // that window perfectly well.
    allowHeaders: [
      "content-type",
      "Request-Id",
      BROWSER_KEY_HEADER,
      BROWSER_SESSION_HEADER,
    ],
  });
}

/** The sandbox surface: the agent's own window, and the registry behind it. */
function registerBrowserOn(app: Hono<AppEnv>, deps: ServerDeps): void {
  registerBrowser(app, {
    registry: deps.browserRegistry,
    keys: deps.browserKeys,
    logger: deps.logger,
    hostKey: deps.config.browserKey,
  });
}

export function buildServer(deps: ServerDeps): BuiltServer {
  const app = new Hono<AppEnv>();
  app.use("*", corsFor(deps.config.uiOrigins));
  app.use(
    "*",
    requestContext({
      logger: deps.logger,
      store: deps.store,
      clock: deps.clock,
      ids: deps.ids,
      tenantId: deps.config.tenantId,
    }),
  );
  app.onError((cause, context) => {
    deps.logger.error("http.unhandled", {
      path: context.req.path,
      cause: cause.message,
    });
    return context.json({ ok: false, reason_code: "PROCESSING_ERROR" }, 500);
  });
  app.get("/healthz", (context) =>
    context.json(
      {
        ok: !deps.draining(),
        mode: deps.config.mode,
        gateway_url: deps.config.gatewayUrl,
        draining: deps.draining(),
      },
      deps.draining() ? 503 : 200,
    ),
  );
  registerChat(app, deps.chat, deps.hub, deps.conversation, deps.beats, deps.browser);
  const socket = registerBeatSocket(app, deps.hub);
  registerBrowserOn(app, deps);
  registerCovenantAmend(app, deps.amend);
  return { app, injectWebSocket: socket.injectWebSocket };
}
