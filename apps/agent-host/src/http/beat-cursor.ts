import type { AppContext } from "./app-env.js";

export type BeatTransport = "sse" | "socket";

/**
 * Where a subscriber wants the replay to start. `epoch` is optional because
 * `EventSource`'s own silent retry carries only `Last-Event-ID`; a cursor
 * without an epoch is trusted, which is exactly what a browser-driven SSE
 * reconnect within the same run needs.
 */
export interface BeatCursor {
  readonly after: number;
  readonly epoch: number | null;
  readonly transport: BeatTransport;
}

function indexOf(raw: string | null): number | null {
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function cursorOf(
  context: AppContext,
  transport: BeatTransport,
): BeatCursor {
  const after =
    context.req.header("Last-Event-ID") ?? context.req.query("after") ?? null;
  return {
    after: indexOf(after) ?? 0,
    epoch: indexOf(context.req.query("epoch") ?? null),
    transport,
  };
}
