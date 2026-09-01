// The ladder's policy, with the three rungs' transports kept out of it: what
// counts as a rung failing, how long to wait before trying it again, when to
// fall, and — the part that is new — when to climb back.
import { feed } from "./beatFold.ts";
import { startReconcile } from "./beatReconcile.ts";
import {
  POLL_INTERVAL_MS,
  rebaseTo,
  type PushRung,
  type StreamSession,
} from "./beatSession.ts";
import { pollOnce } from "./beatPoll.ts";
import { openEventStream, type EventStreamHandlers } from "./beatEvents.ts";
import { beatSocketUrl, openBeatSocket } from "./beatSocket.ts";

/** What a rung that has worked before is worth before the ladder falls. */
const SOCKET_BACKOFF_MS = [250, 1_000, 3_000];
const SSE_BACKOFF_MS = [500, 2_000];

/** Bounded, and it never stops: polling is a rung, not a destination. */
const CLIMB_BACKOFF_MS = [1_000, 3_000, 8_000, 20_000, 30_000];

function delayOf(schedule: readonly number[], attempt: number): number {
  return schedule[Math.min(attempt, schedule.length - 1)] ?? 0;
}

/**
 * A push rung's rebase, which carries an epoch and nothing else. The new run
 * may belong to another chat and the frames do not say, so the cursor moves
 * and the stream is not trusted again until `/chat/state` names the owner.
 */
function rebased(session: StreamSession, epoch: number): void {
  rebaseTo(session, epoch);
  if (session.owns === "unknown") session.reprobe();
}

function later(session: StreamSession, run: () => void, ms: number): void {
  if (session.retry !== null) clearTimeout(session.retry);
  session.retry = setTimeout(() => {
    session.retry = null;
    if (!session.stopped) run();
  }, ms);
}

/** A rung that is actually delivering. Everything below it stands down. */
function opened(
  session: StreamSession,
  rung: PushRung,
  transport: string,
): void {
  session.rung = rung;
  session.proven[rung] = true;
  session.announced = false;
  session.detail = null;
  session.attempt = 0;
  session.climb = 0;
  session.failures = 0;
  if (session.timer !== null) clearTimeout(session.timer);
  session.timer = null;
  if (session.retry !== null) clearTimeout(session.retry);
  session.retry = null;
  session.emit({ kind: "status", status: "live", detail: transport });
  // A stream believed live is checked, slowly, against the one surface that
  // cannot go quiet without meaning it — a half-open connection drops no
  // error, and without this the run's closing beats never reached the screen.
  startReconcile(session, () => connectSocket(session));
}

function scheduleClimb(session: StreamSession): void {
  if (typeof WebSocket === "undefined" || session.stopped) return;
  const wait = delayOf(CLIMB_BACKOFF_MS, session.climb);
  session.climb += 1;
  later(
    session,
    () => {
      if (session.rung === "poll" && session.socket === null)
        connectSocket(session);
    },
    wait,
  );
}

export function startPolling(
  session: StreamSession,
  detail: string | null,
): void {
  if (session.stopped) return;
  if (session.rung === "poll") {
    scheduleClimb(session);
    return;
  }
  session.rung = "poll";
  session.detail = detail;
  session.announced = false;
  const tick = (): void => {
    if (session.stopped || session.rung !== "poll") return;
    void pollOnce(session).then(() => {
      if (!session.stopped && session.rung === "poll")
        session.timer = setTimeout(tick, POLL_INTERVAL_MS);
    });
  };
  tick();
  scheduleClimb(session);
}

function sseDied(session: StreamSession, detail: string): void {
  session.source?.close();
  session.source = null;
  if (session.stopped) return;
  session.attempt += 1;
  if (!session.proven.sse || session.attempt > SSE_BACKOFF_MS.length) {
    startPolling(session, detail);
    return;
  }
  session.emit({ kind: "status", status: "connecting", detail });
  later(
    session,
    () => connectSse(session, detail),
    delayOf(SSE_BACKOFF_MS, session.attempt - 1),
  );
}

function sseHandlers(session: StreamSession): EventStreamHandlers {
  return {
    onOpen: () => opened(session, "sse", "server-sent events"),
    onBeat: (index, beat) => feed(session, beat, index),
    onRebase: (epoch) => rebased(session, epoch),
    onDead: (detail) => sseDied(session, detail),
  };
}

function connectSse(session: StreamSession, detail: string): void {
  const url = `${session.base}/chat/stream?after=${session.seen}&epoch=${session.epoch}`;
  session.source = openEventStream(
    url,
    () => session.seen + 1,
    sseHandlers(session),
  );
  if (session.source === null)
    startPolling(session, `${detail}, and no streaming either`);
}

/** The socket rung is spent. Fall — unless we were only visiting from below. */
function fallToSse(session: StreamSession, detail: string): void {
  if (session.rung === "poll") {
    scheduleClimb(session);
    return;
  }
  session.rung = "sse";
  session.attempt = 0;
  connectSse(session, detail);
}

function socketDied(session: StreamSession, detail: string): void {
  session.socket = null;
  if (session.stopped) return;
  if (session.rung === "poll") {
    scheduleClimb(session);
    return;
  }
  session.attempt += 1;
  if (!session.proven.socket || session.attempt > SOCKET_BACKOFF_MS.length) {
    fallToSse(session, detail);
    return;
  }
  session.emit({ kind: "status", status: "connecting", detail });
  later(
    session,
    () => connectSocket(session),
    delayOf(SOCKET_BACKOFF_MS, session.attempt - 1),
  );
}

export function connectSocket(session: StreamSession): void {
  if (session.stopped) return;
  if (session.retry !== null) clearTimeout(session.retry);
  session.retry = null;
  session.socket?.close();
  session.socket = null;
  if (typeof WebSocket === "undefined") {
    fallToSse(session, "this browser has no live connection");
    return;
  }
  session.socket = openBeatSocket(
    beatSocketUrl(session.base, session.seen, session.epoch),
    {
      onOpen: () => opened(session, "socket", "websocket"),
      onBeat: (epoch, index, beat) => {
        rebased(session, epoch);
        feed(session, beat, index);
      },
      onRebase: (epoch) => rebased(session, epoch),
      onDead: (detail) => socketDied(session, detail),
    },
  );
  if (session.socket === null)
    socketDied(session, "the connection was refused");
}
