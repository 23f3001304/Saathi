import type { Logger } from "@covenant/domain";
import type { Hono } from "hono";
import { z } from "zod";

import type { SessionHandle } from "../browser/browser-registry.js";
import {
  NotYourTurnError,
  NotYourWindowError,
} from "../browser/browser-service.js";
import { openFixtureShop } from "../browser/demo-walk.js";
import { relayRequest } from "../browser/relay-input.js";
import type { AppContext, AppEnv } from "./app-env.js";
import { BROWSER_SESSION_HEADER } from "./browser-key.js";
import { found, type ResolveWindow } from "./window-resolve.js";

/**
 * Either the fixture shop by page name, or any URL the navigation policy will
 * accept. The policy, not this schema, is what closes `chrome://` and the disk.
 */
const openRequest = z.object({
  page: z
    .string()
    .regex(/^[a-z0-9-]+\.html$/)
    .default("index.html"),
  url: z.url().nullable().default(null),
  /** Walk the guarded agent surface as far as the first refusal. */
  walk: z.boolean().default(true),
});

async function open(
  context: AppContext,
  handle: SessionHandle,
  logger: Logger,
): Promise<Response> {
  const parsed = openRequest.safeParse(
    await context.req.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  const service = handle.service;
  // A person asking for a window is a person who means to watch it, whatever
  // phase left it concealed.
  service.phase.reveal();
  if (parsed.data.url !== null) {
    const landed = await service.open(parsed.data.url);
    return context.json(
      { ok: landed.ok, session: service.view(), ...(landed.ok ? {} : landed) },
      200,
    );
  }
  const view = await openFixtureShop(
    service,
    parsed.data.page,
    parsed.data.walk,
    logger,
  );
  return context.json({ ok: true, session: view }, 200);
}

/**
 * The window this caller thinks it is driving. The path already names a
 * session, so this is the second, older half of the same question: which
 * *container* that session is on now. A call carrying none is left alone; one
 * naming a window that has since been replaced is refused rather than quietly
 * re-aimed at whatever is open under that id today.
 */
function askedSession(context: AppContext): string | null {
  const header = context.req.header(BROWSER_SESSION_HEADER);
  return header === undefined || header === "" ? null : header;
}

/** The page swapping processes under a click closes the CDP connection the
 *  relay was riding; the input threw, the route 500'd, and the person saw a
 *  processing error for pressing a button during a redirect. A swap settles
 *  in a few hundred milliseconds, so one quiet retry usually lands it. */
const SWAP_ERROR = /connection closed|target closed|session closed|detached/i;
const SWAP_RETRY_MS = 300;

async function input(
  context: AppContext,
  handle: SessionHandle,
): Promise<Response> {
  const parsed = relayRequest.safeParse(
    await context.req.json().catch(() => null),
  );
  if (!parsed.success) {
    return context.json({ ok: false, reason_code: "SCHEMA_VIOLATION" }, 400);
  }
  try {
    handle.service.assertBoundTo(askedSession(context));
    // A refusal is the system working, so it is a 200 with `ok: false` — the
    // same shape the rest of this host uses for a rejected write.
    return context.json(await handle.service.relay(parsed.data), 200);
  } catch (cause) {
    if (cause instanceof Error && SWAP_ERROR.test(cause.message)) {
      await new Promise((resolve) => setTimeout(resolve, SWAP_RETRY_MS));
      try {
        return context.json(await handle.service.relay(parsed.data), 200);
      } catch {
        return context.json(
          {
            ok: false,
            reason_code: "PAGE_CHANGING",
            human:
              "The page is changing under that click. Give it a second " +
              "and try again.",
          },
          200,
        );
      }
    }
    return refusal(context, cause);
  }
}

function refusal(context: AppContext, cause: unknown): Response {
  if (cause instanceof NotYourWindowError) {
    return context.json(
      { ok: false, reason_code: "NOT_YOUR_WINDOW", human: cause.message },
      409,
    );
  }
  if (cause instanceof NotYourTurnError) {
    return context.json(
      { ok: false, reason_code: "NOT_YOUR_TURN", human: cause.message },
      409,
    );
  }
  throw cause;
}

/**
 * Everything that changes the window. `input` is the only one that reaches the
 * page, and every call through it is re-judged by the same classifier the
 * agent is blocked by. `front` exists precisely so the refusal has somewhere
 * to send you — the real window, where nothing we run sees the keys.
 */
function registerAct(
  app: Hono<AppEnv>,
  prefix: string,
  resolve: ResolveWindow,
  logger: Logger,
): void {
  app.post(`${prefix}/open`, (context) => {
    const handle = resolve(context);
    return found(handle) ? open(context, handle, logger) : handle;
  });

  app.post(`${prefix}/input`, (context) => {
    const handle = resolve(context);
    return found(handle) ? input(context, handle) : handle;
  });

  app.post(`${prefix}/close`, async (context) => {
    const handle = resolve(context);
    if (!found(handle)) return handle;
    await handle.service.close();
    return context.json({ ok: true }, 200);
  });
}

/** Who holds the wheel, and where control goes when the sandbox is wrong. */
function registerWheel(
  app: Hono<AppEnv>,
  prefix: string,
  resolve: ResolveWindow,
): void {
  app.post(`${prefix}/takeover`, (context) => {
    const handle = resolve(context);
    if (!found(handle)) return handle;
    handle.service.phase.reveal();
    return context.json(
      {
        ok: handle.service.takeover() !== null,
        session: handle.service.view(),
      },
      200,
    );
  });

  app.post(`${prefix}/resume`, (context) => {
    const handle = resolve(context);
    if (!found(handle)) return handle;
    return context.json(
      { ok: handle.service.resume(), session: handle.service.view() },
      200,
    );
  });

  // Named for what it does on both surfaces: hand this page to the human. On
  // the desktop that raises a window; in a container it answers with the URL
  // to open in their own browser, for what a container cannot do at all.
  app.post(`${prefix}/front`, async (context) => {
    const handle = resolve(context);
    if (!found(handle)) return handle;
    const target = await handle.service.handToUser();
    return context.json({ ok: target !== null, handoff: target }, 200);
  });
}

export function registerWindowDrive(
  app: Hono<AppEnv>,
  prefix: string,
  resolve: ResolveWindow,
  logger: Logger,
): void {
  registerAct(app, prefix, resolve, logger);
  registerWheel(app, prefix, resolve);
}
