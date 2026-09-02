// The push rungs' liveness check. A websocket or SSE stream falls only on an
// explicit error, and a half-open connection never raises one: the host emits
// a run's closing beats, nothing arrives, and the screen says "Working…" for
// as long as anybody watches it. `/chat/state` carries the whole beat list,
// so a slow heartbeat against it turns that silence into, at worst, a few
// seconds of lag.
import { parseChatState } from "../api/agentBeat.ts";
import { epochOf } from "./beatEvents.ts";
import { stateUrl } from "./beatScope.ts";
import { claim, drain } from "./beatFold.ts";
import { rebaseTo, type StreamSession } from "./beatSession.ts";

/** Slow on purpose: this is a safety net under a stream believed live, not
 *  the polling rung. Two of these decide a dead stream, so the worst case for
 *  a wedged socket is roughly twice this before the reconnect. */
export const RECONCILE_INTERVAL_MS = 3_000;

/** Heartbeats in a row that caught the stream behind before the rung is
 *  declared dead. One is a race — a beat in flight loses to a poll response
 *  taken a moment later; two in a row is a stream that has stopped. */
const MISSES_TO_KICK = 2;

type Verdict = "clean" | "missed";

/**
 * One reconciliation. It reads the same body the polling rung does and folds
 * through the same cursor, so a beat the stream already delivered is skipped
 * by `feed`'s index check and a beat the stream lost lands exactly once. A
 * rebase the stream never announced is handled the way the stream would have:
 * cursor reset, ownership re-asked, the new run folded from its start.
 *
 * DECISION: fetch failures are not this timer's business. The status voice —
 * live, degraded, offline — belongs to the rungs and the polling loop, and a
 * heartbeat that announced states would be a fourth rung in disguise. A host
 * that is truly gone starves the stream too, and the miss counter reconnects
 * the rung, whose own failure handling then walks the ladder honestly.
 */
async function reconcileOnce(session: StreamSession): Promise<Verdict> {
  const res = await fetch(stateUrl(session));
  if (!res.ok) return "clean";
  const raw: unknown = await res.json();
  const state = parseChatState(raw);
  if (state === null) return "clean";
  const epoch = epochOf(raw);
  const moved = epoch > 0 && epoch !== session.epoch;
  if (moved) rebaseTo(session, epoch);
  if (session.owns === "unknown") claim(session, state.conversation);
  // Drained either way: a rebase still needs the new run's beats applied.
  const verdict = drainVerdict(session, state.beats);
  return moved ? "missed" : verdict;
}

/** Whether the STREAM delivered anything since the previous heartbeat.
 *  During an active run the poll often fetches a beat milliseconds before
 *  the socket delivers it; calling that a miss reconnected a healthy
 *  stream every six seconds and replayed the whole page's animations. */
function drainVerdict(
  session: StreamSession,
  beats: Parameters<typeof drain>[1],
): Verdict {
  const before = session.seen;
  const streamMoved = before > session.seenLastTick;
  drain(session, beats);
  session.seenLastTick = session.seen;
  const polledAhead = session.seen > before;
  return polledAhead && !streamMoved ? "missed" : "clean";
}

/**
 * Runs while a push rung believes itself live and stands down the moment the
 * session leaves it — falling to the polling rung, stopping, or being torn
 * down all end it, the first two through the rung check and the last through
 * `clearTimers`.
 */
export function startReconcile(
  session: StreamSession,
  reconnect: () => void,
): void {
  if (session.heartbeat !== null) clearTimeout(session.heartbeat);
  session.misses = 0;
  const tick = (): void => {
    session.heartbeat = null;
    if (session.stopped || session.rung === "poll") return;
    void reconcileOnce(session)
      .then((verdict) => {
        session.misses = verdict === "missed" ? session.misses + 1 : 0;
        if (session.misses < MISSES_TO_KICK) return;
        session.misses = 0;
        reconnect();
      })
      .catch(() => undefined)
      .finally(() => {
        if (session.stopped || session.rung === "poll") return;
        if (session.heartbeat !== null) return;
        session.heartbeat = setTimeout(tick, RECONCILE_INTERVAL_MS);
      });
  };
  session.heartbeat = setTimeout(tick, RECONCILE_INTERVAL_MS);
}
