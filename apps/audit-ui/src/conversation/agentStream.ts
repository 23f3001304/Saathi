// The wire half of the live assistant transport: agent-host's beat stream, on
// a ladder. A WebSocket where the runtime has one, SSE where it does not, and
// `GET /chat/state` when neither will hold — and back up again, because a
// session that fell once is not a session that must stay down.
import { parseChatState } from "../api/agentBeat.ts";
import { epochOf } from "./beatEvents.ts";
import { stateUrl } from "./beatScope.ts";
import { claim } from "./beatFold.ts";
import { clearTimers, rebaseTo, type StreamSession } from "./beatSession.ts";
import { connectSocket } from "./beatLadder.ts";

export { drain, feed, fold } from "./beatFold.ts";
export { newSession, type StreamSession } from "./beatSession.ts";
export { pollOnce } from "./beatPoll.ts";
export { restore } from "./beatRestore.ts";
export { startPolling } from "./beatLadder.ts";

/**
 * DECISION (replacing "one SSE attempt, then polling for the rest of the
 * session"): the ladder climbs. Why: `/chat/state` does carry the whole beat
 * list, so polling loses no information — but it loses the *live* reading, and
 * the old rule made a single blip permanent. An agent-host restart, a
 * suspended laptop, a proxy reaping an idle stream: any one of them downgraded
 * the session for good, and the banner said so for the rest of the demo.
 * Falling is still immediate and still announced. What is new is that the fall
 * is not the end — while polling, the ladder keeps trying the socket on a
 * bounded backoff, and takes it the moment it opens.
 *
 * The retries are asymmetric on purpose. A rung that has never once opened in
 * this session gets a single try and is fallen past, because a proxy that
 * forbids WebSockets will forbid them again in 250ms and first paint should
 * not wait to find that out. A rung that *was* carrying beats and dropped gets
 * the backoff ladder, because that one is a blip and blips end.
 *
 * Offline stays terminal, because it means something else: four consecutive
 * silent polls, roughly two seconds with nothing on any rung. That is where
 * `resilientTransport` hands the screen to the fixture reel and says so, and a
 * transport that climbed back out from under the reel would be lying twice.
 */
export function connect(session: StreamSession): void {
  session.rung = "socket";
  session.attempt = 0;
  connectSocket(session);
}

/**
 * A fresh chat opens on the greeting, not on somebody else's transcript. The
 * host keeps the last run's beats after it ends, so attaching from zero
 * replayed a finished purchase into an empty conversation the instant the page
 * loaded. A run still in flight is the opposite case: that one is yours to
 * walk back into, so it is adopted whole.
 *
 * DECISION: a finished run whose epoch the restore already named is *not*
 * skipped. Why: the rule above exists to keep a fresh chat off somebody else's
 * purchase, and a run this conversation's own log carries is not somebody
 * else's — skipping it would drop the last beats of the run being reloaded,
 * which is exactly the tail the shopper came back to read.
 */
export async function probeState(session: StreamSession): Promise<void> {
  try {
    const res = await fetch(stateUrl(session));
    if (!res.ok) return;
    const raw: unknown = await res.json();
    const state = parseChatState(raw);
    if (state === null) return;
    const epoch = epochOf(raw);
    const mine = epoch !== 0 && epoch === session.restoredEpoch;
    rebaseTo(session, epoch);
    claim(session, state.conversation);
    const finished = !state.running && state.awaiting.length === 0;
    if (finished && !mine) session.seen = state.beats.length;
  } catch {
    // The probe only decides where to start; the ladder reports real failures.
    // Ownership is left unknown rather than guessed at, and the beats that
    // arrive meanwhile wait: this rung's own poll asks the same question every
    // half second, and a host that answers no rung at all has no beats to hold.
  }
}

/**
 * The probe runs before any rung does: it decides where to start, and the
 * cursor it sets is carried onto the socket as `?after=&epoch=` exactly as it
 * is onto SSE and polling.
 *
 * It is also the session's standing answer to "whose run is this?". A scoped
 * session's wire (`beatScope.ts`) only ever serves its own lane, so the probe
 * confirms; the unscoped wire is one fan-out with unstamped beats, so there
 * the probe's answer holds only for the epoch it named — the ladder re-asks
 * through `reprobe` on every rebase, which is the moment the run underneath
 * can have become a different conversation's.
 */
export async function attach(session: StreamSession): Promise<void> {
  session.reprobe = () => {
    void probeState(session);
  };
  await probeState(session);
  connect(session);
}

export function stop(session: StreamSession): void {
  session.stopped = true;
  clearTimers(session);
}

/**
 * DECISION (replacing "reattach from zero"): a new run no longer tears the
 * connection down. The host rebases its own indices and now says so on the
 * wire — a `rebase` frame on the socket, a named `rebase` event on SSE, a
 * fresh `epoch` on `/chat/state` — so the high-water mark is reset by the side
 * that moved it rather than guessed at by a reconnect that could race the
 * run's opening beats. What is left here is the kick: a new run is a good
 * moment to try climbing again instead of waiting out the backoff.
 */
export function restart(session: StreamSession): void {
  if (session.stopped) return;
  session.climb = 0;
  session.attempt = 0;
  if (session.rung === "poll") {
    connectSocket(session);
    return;
  }
  if (session.socket !== null) return;
  session.source?.close();
  session.source = null;
  connectSocket(session);
}
