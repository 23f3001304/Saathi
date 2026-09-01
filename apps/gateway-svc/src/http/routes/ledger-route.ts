import type { Hono } from "hono";

import type { CompositionRoot } from "../../composition-root.js";
import type { AppContext, AppEnv } from "../app-env.js";
import { readHeaders } from "../middleware/acp-headers.js";
import { positiveInt, sendReason } from "./reply.js";

const DEFAULT_PAGE = 200;

const MAX_PAGE = 1000;

const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  // Nginx and friends buffer by default, which turns a live stream into a dump.
  "X-Accel-Buffering": "no",
};

/** `Last-Event-ID: <seq>` on reconnect replays `seq > n`, then attaches live. */
function lastEventIdOf(context: AppContext): number | null {
  const header =
    context.req.header("Last-Event-ID") ?? context.req.query("after") ?? null;
  if (header === null) {
    return null;
  }
  const parsed = Number.parseInt(header, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** One concurrent replay: it is the most expensive query the service runs. */
class ReplayLock {
  private running = false;

  tryAcquire(): boolean {
    if (this.running) {
      return false;
    }
    this.running = true;
    return true;
  }

  release(): void {
    this.running = false;
  }
}

function stream(context: AppContext, root: CompositionRoot): Response {
  return context.body(
    root.stores.hub.open(lastEventIdOf(context)),
    200,
    SSE_HEADERS,
  );
}

/**
 * `/ledger/*` (§4.10, §4.11). Stream and backfill serve the **identical**
 * frame shape, so the client reducer stays idempotent on `id` and a reconnect
 * cannot produce a gap the UI would have to paper over.
 */
export function registerLedger(app: Hono<AppEnv>, root: CompositionRoot): void {
  const admission = {
    config: root.config,
    clock: root.clock,
    gate: root.keys.admission,
    keys: root.keys.keys,
  };
  app.get("/v1/ledger/stream", (context) => stream(context, root));
  app.get("/v1/ledger/events", readHeaders(admission), (context) =>
    context.json({
      frames: root.stores.reader.framesAfter(
        lastEventIdOf(context) ?? 0,
        positiveInt(context.req.query("limit"), DEFAULT_PAGE, MAX_PAGE),
      ),
      head: root.stores.reader.height(),
    }),
  );
  app.get("/v1/ledger/head", readHeaders(admission), (context) => {
    const head = root.stores.reader.head();
    return context.json({
      height: head?.seq ?? 0,
      head_hash: head?.this_hash ?? null,
      verified_at: root.clock.now().toISOString(),
    });
  });
  app.post("/v1/ledger/verify", readHeaders(admission), (context) =>
    context.json(root.folds.verifier.verify()),
  );
  registerReplay(app, root, admission);
}

function registerReplay(
  app: Hono<AppEnv>,
  root: CompositionRoot,
  admission: Parameters<typeof readHeaders>[0],
): void {
  const lock = new ReplayLock();
  app.post("/v1/ledger/replay", readHeaders(admission), (context) => {
    if (!lock.tryAcquire()) {
      return sendReason(context, root.clock, "RATE_LIMITED");
    }
    try {
      const result = root.folds.rebuilder.rebuild();
      return context.json({
        ok: result.ok,
        live_state_hash: result.liveStateHash,
        replayed_state_hash: result.replayedStateHash,
        events: result.events,
        ms: result.ms,
        first_divergent_id: result.drift[0]?.table ?? null,
      });
    } finally {
      lock.release();
    }
  });
}
