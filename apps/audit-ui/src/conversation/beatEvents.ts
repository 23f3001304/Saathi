// The middle rung: agent-host's `GET /chat/stream`. Deliberately the same
// handler shape the socket rung exposes, so the ladder above holds one policy
// rather than one per transport — the only real difference is that SSE carries
// the index in `id:` instead of in the payload.
import { parseBeat, type AgentBeat } from "../api/agentBeat.ts";

export interface EventStreamHandlers {
  readonly onOpen: () => void;
  readonly onBeat: (index: number, beat: AgentBeat) => void;
  readonly onRebase: (epoch: number) => void;
  readonly onDead: (detail: string) => void;
}

export function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** The run these indices belong to, or 0 when the peer did not say. */
export function epochOf(raw: unknown): number {
  if (typeof raw !== "object" || raw === null) return 0;
  const epoch = (raw as { epoch?: unknown }).epoch;
  return typeof epoch === "number" && Number.isFinite(epoch) ? epoch : 0;
}

function onMessage(
  event: MessageEvent<string>,
  fallback: number,
  handlers: EventStreamHandlers,
): void {
  const parsed = Number.parseInt(event.lastEventId, 10);
  const beat = parseBeat(safeJson(event.data));
  if (beat !== null)
    handlers.onBeat(Number.isInteger(parsed) ? parsed : fallback, beat);
}

/**
 * `null` when this runtime has no `EventSource` — Node keeps it behind
 * `--experimental-eventsource`, which the repo gate does not pass.
 */
export function openEventStream(
  url: string,
  nextIndex: () => number,
  handlers: EventStreamHandlers,
): EventSource | null {
  if (typeof EventSource === "undefined") return null;
  const source = new EventSource(url);
  // "live" is claimed when the stream actually opens, not when it is asked for.
  source.onopen = () => {
    handlers.onOpen();
  };
  source.onmessage = (event: MessageEvent<string>) => {
    onMessage(event, nextIndex(), handlers);
  };
  source.addEventListener("rebase", (event) => {
    handlers.onRebase(epochOf(safeJson((event as MessageEvent<string>).data)));
  });
  source.onerror = () => {
    handlers.onDead("the connection dropped");
  };
  return source;
}
