import type { Logger } from "@covenant/domain";
import type { Hono } from "hono";
import { z } from "zod";

import type { SessionHandle } from "../browser/browser-registry.js";
import { openFixtureShop } from "../browser/demo-walk.js";
import { input } from "./window-input.js";
import type { AppContext, AppEnv } from "./app-env.js";
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
    const resumed = handle.service.resume();
    // Handing the wheel back IS "carry on": the parked checkout continues
    // in the same window without the shopper typing anything.
    if (resumed) handle.onWheelBack?.();
    return context.json(
      { ok: resumed, session: handle.service.view() },
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
