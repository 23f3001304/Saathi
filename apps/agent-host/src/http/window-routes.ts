import type { Logger } from "@covenant/domain";
import type { Hono } from "hono";

import type { SessionHandle } from "../browser/browser-registry.js";
import type { AppContext, AppEnv } from "./app-env.js";
import { frameStream, payloadOf } from "./frame-stream.js";
import { registerWindowDrive } from "./window-drive.js";
import { found, type ResolveWindow } from "./window-resolve.js";

export { found, type ResolveWindow } from "./window-resolve.js";

const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** A frame poll may never outlive a frame. The capture rides the window's
 *  CDP session, and mid-errand that session can wedge for seconds; an
 *  unbounded await here hung the poll, six hung polls exhausted the
 *  browser's per-origin connection budget, and every other request from
 *  that tab queued behind them: the "blank, frozen page" in one bug. */
const FRAME_CEILING_MS = 4_000;

function boundedFrame(
  handle: SessionHandle,
): Promise<Awaited<ReturnType<SessionHandle["service"]["frame"]>> | null> {
  return Promise.race([
    handle.service.frame(),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), FRAME_CEILING_MS),
    ),
  ]);
}

async function frame(
  context: AppContext,
  handle: SessionHandle,
): Promise<Response> {
  const captured = await boundedFrame(handle);
  const view = handle.service.view();
  if (captured === null || view === null) {
    // Not an error: a window with no picture ready yet is the ordinary
    // state between casts. A 404 here painted every such moment red in
    // the browser console and read to the shopper as a broken card.
    return context.json({ ok: false, reason_code: "NO_FRAME" }, 200);
  }
  return context.json(
    { ok: true, frame: payloadOf(captured, 0, view.url, view.state) },
    200,
  );
}

/**
 * Looking at the window: state, one frame, the field boxes, the stream.
 *
 * DECISION: the `GET` routes are gated exactly as hard as the drive routes,
 * though a screenshot changes nothing. They carry pictures of a window that
 * may be showing the user's signed-in account, and "reading is harmless" stops
 * being true the moment the reader is a page the user did not open — or, now
 * that this host holds several windows, an errand that is not this one.
 */
function registerWindowReads(
  app: Hono<AppEnv>,
  prefix: string,
  resolve: ResolveWindow,
  logger: Logger,
): void {
  app.get(`${prefix}/state`, (context) => {
    const handle = resolve(context);
    if (!found(handle)) return handle;
    return context.json({ ok: true, session: handle.service.view() }, 200);
  });

  app.get(`${prefix}/frame`, (context) => {
    const handle = resolve(context);
    return found(handle) ? frame(context, handle) : handle;
  });

  app.get(`${prefix}/fields`, async (context) => {
    const handle = resolve(context);
    if (!found(handle)) return handle;
    return context.json(
      { ok: true, fields: await handle.service.fields() },
      200,
    );
  });

  app.get(`${prefix}/frames`, (context) => {
    const handle = resolve(context);
    if (!found(handle)) return handle;
    // One feed per subscriber, per window. Two tabs on the same session get a
    // stream each, and neither can be starved by the other's backpressure.
    return context.body(frameStream(handle.service, logger), 200, SSE_HEADERS);
  });
}

/**
 * The sandbox surface for one window, registered under whatever prefix names
 * it. The single-window paths and the per-session paths are the same handlers
 * over different resolvers, so there is one implementation of every one of
 * these and no chance of the two drifting apart on a guard.
 */
export function registerWindow(
  app: Hono<AppEnv>,
  prefix: string,
  resolve: ResolveWindow,
  logger: Logger,
): void {
  registerWindowReads(app, prefix, resolve, logger);
  registerWindowDrive(app, prefix, resolve, logger);
}
