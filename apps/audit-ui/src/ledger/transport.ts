// §4.1 mechanics: EventSource with resume, exponential backoff, and a
// polling fallback that shares the exact same frame shape — the reducer
// cannot tell which one fed it.
//
// DECISION: polling is a rung, not a destination — the same correction the
// conversation ladder got. Why: the fall was one-way, so a gateway blip left
// the chain chip reading "polling" for the rest of the session even after the
// stream came back. A runtime with no `EventSource` has nothing to climb to.
import type { ConnectionMode, LedgerFrame } from "./types.ts";

const BACKOFF_SCHEDULE_MS = [500, 1000, 2000, 4000];
const MAX_SSE_ATTEMPTS = 3;
const POLL_INTERVAL_MS = 750;

/** Four silent polls after the SSE ladder ran out: the gateway is not there. */
const MAX_POLL_FAILURES = 4;

const PAGE_LIMIT = 200;
const CLIMB_BACKOFF_MS = [3000, 8000, 20000, 30000];

/**
 * gateway-svc mounts its read surface under `/v1` and pins the semantic
 * version on every header-checked route (`readHeaders`). `/v1/ledger/stream`
 * is deliberately outside that gate — EventSource cannot set headers — so the
 * stream is header-free and only the polling backfill carries them.
 */
const API_VERSION = "2026-08-31";

export type LedgerTransport = { close: () => void };
export type LedgerTransportHandlers = {
  onFrame: (frame: LedgerFrame) => void;
  onModeChange: (mode: ConnectionMode) => void;
  /** Neither the stream nor the backfill answered; the caller decides what to show. */
  onUnreachable?: (detail: string) => void;
};

type Session = {
  baseUrl: string;
  handlers: LedgerTransportHandlers;
  closed: boolean;
  lastId: number;
  attempt: number;
  failures: number;
  /** Whether the polling loop, rather than the stream, is carrying frames. */
  polling: boolean;
  climb: number;
  source: EventSource | null;
  timers: ReturnType<typeof setTimeout>[];
};

function backoffDelay(attempt: number): number {
  const capped = Math.min(attempt, BACKOFF_SCHEDULE_MS.length - 1);
  return BACKOFF_SCHEDULE_MS[capped] ?? 4000;
}

function schedule(session: Session, fn: () => void, ms: number): void {
  session.timers.push(setTimeout(fn, ms));
}

function readHeaders(): Record<string, string> {
  return { "Request-Id": crypto.randomUUID(), "API-Version": API_VERSION };
}

/** `{ frames, head }` on the wire; the reducer only ever sees the frames. */
function framesOf(body: unknown): LedgerFrame[] {
  if (typeof body !== "object" || body === null) return [];
  const frames = (body as { frames?: unknown }).frames;
  return Array.isArray(frames) ? (frames as LedgerFrame[]) : [];
}

function giveUp(session: Session, detail: string): void {
  if (session.closed) return;
  session.closed = true;
  session.handlers.onModeChange("offline");
  session.handlers.onUnreachable?.(detail);
}

async function pollOnce(session: Session): Promise<void> {
  try {
    const res = await fetch(
      `${session.baseUrl}/v1/ledger/events?after=${session.lastId}&limit=${PAGE_LIMIT}`,
      { headers: readHeaders() },
    );
    if (!res.ok) throw new Error(`ledger/events → ${res.status}`);
    session.failures = 0;
    for (const frame of framesOf(await res.json())) {
      session.lastId = Math.max(session.lastId, frame.id);
      session.handlers.onFrame(frame);
    }
  } catch (cause) {
    session.failures += 1;
    if (session.failures >= MAX_POLL_FAILURES)
      giveUp(session, cause instanceof Error ? cause.message : String(cause));
  }
}

function scheduleClimb(session: Session): void {
  if (typeof EventSource === "undefined" || session.closed) return;
  const step = Math.min(session.climb, CLIMB_BACKOFF_MS.length - 1);
  session.climb += 1;
  const climb = (): void => {
    if (session.polling) connectSSE(session);
  };
  schedule(session, climb, CLIMB_BACKOFF_MS[step] ?? 30000);
}

function startPolling(session: Session): void {
  if (session.polling) return scheduleClimb(session);
  session.polling = true;
  session.handlers.onModeChange("polling");
  const tick = (): void => {
    if (session.closed || !session.polling) return;
    void pollOnce(session).then(() =>
      schedule(session, tick, POLL_INTERVAL_MS),
    );
  };
  tick();
  scheduleClimb(session);
}

function handleSseMessage(session: Session, event: MessageEvent<string>): void {
  streamIsUp(session);
  const frame = JSON.parse(event.data) as LedgerFrame;
  session.lastId = Math.max(session.lastId, frame.id);
  session.handlers.onFrame(frame);
}

/** The stream is carrying frames again; the polling loop stands down. */
function streamIsUp(session: Session): void {
  session.polling = false;
  session.attempt = 0;
  session.climb = 0;
  session.handlers.onModeChange("sse");
}

function handleSseError(session: Session): void {
  session.source?.close();
  if (session.closed) return;
  // Only visiting from below: the climb failed, so keep polling and try again.
  if (session.polling) return scheduleClimb(session);
  session.attempt += 1;
  if (session.attempt > MAX_SSE_ATTEMPTS) {
    startPolling(session);
    return;
  }
  session.handlers.onModeChange("sse");
  schedule(
    session,
    () => connectSSE(session),
    backoffDelay(session.attempt - 1),
  );
}

/**
 * DECISION: EventSource cannot set a `Last-Event-ID` request header on a
 * manually-recreated connection (only the browser's own silent retry can),
 * so a resumed connection carries the cursor as `?after=` instead — the
 * same query param the polling fallback already uses, and the same one
 * `lastEventIdOf` reads server-side.
 */
function connectSSE(session: Session): void {
  if (session.closed) return;
  if (typeof EventSource === "undefined") {
    startPolling(session);
    return;
  }
  session.source = new EventSource(
    `${session.baseUrl}/v1/ledger/stream?after=${session.lastId}`,
  );
  session.source.onopen = () => streamIsUp(session);
  session.source.onmessage = (event: MessageEvent<string>) =>
    handleSseMessage(session, event);
  session.source.onerror = () => handleSseError(session);
}

export function connectLedgerTransport(
  baseUrl: string,
  handlers: LedgerTransportHandlers,
): LedgerTransport {
  const session: Session = {
    baseUrl,
    handlers,
    closed: false,
    lastId: 0,
    attempt: 0,
    failures: 0,
    polling: false,
    climb: 0,
    source: null,
    timers: [],
  };
  connectSSE(session);
  return {
    close: () => {
      session.closed = true;
      session.source?.close();
      session.timers.forEach((id) => clearTimeout(id));
    },
  };
}
