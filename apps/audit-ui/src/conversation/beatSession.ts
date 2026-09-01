// What the beat ladder carries between its rungs: how far into the run the
// screen has got, which run that count belongs to, and the bottom rung itself
// — `GET /chat/state`, which is the one surface that answers when no stream
// will hold.
import type { AgentBeat } from "../api/agentBeat.ts";
import type { Emit } from "./assistantTransport.ts";
import type { BeatSocket } from "./beatSocket.ts";

export const POLL_INTERVAL_MS = 500;

/**
 * DECISION (was two seconds): twelve seconds of unbroken silence before the UI
 * calls the host gone. Why: agent-host takes several seconds to come back up,
 * so a two-second verdict turned every restart into "offline, here is the
 * scripted reel" — and handing the screen to the reel is the one thing that
 * must never happen to a host that is merely rebooting. Offline still means
 * offline; it just means it after long enough to be true.
 */
export const OFFLINE_AFTER_MS = 12_000;

export const MAX_POLL_FAILURES = OFFLINE_AFTER_MS / POLL_INTERVAL_MS;

/** Which rung is currently delivering beats. */
export type Rung = "socket" | "sse" | "poll";

/**
 * Whose run the hub is currently fanning out. The hub is one stream for the
 * whole host and the beats carry no conversation id, so a chat that folded
 * whatever arrived put another chat's run — drafts, cards, sandbox and all —
 * into its own transcript the moment two chats existed. `GET /chat/state`
 * names the owner; that answer holds for the epoch it named and no further,
 * which is why a rebase puts this back to `unknown`.
 */
export type Ownership = "unknown" | "mine" | "theirs";

/** The two rungs that push. Polling is what happens when neither will. */
export type PushRung = Exclude<Rung, "poll">;

export type StreamSession = {
  emit: Emit;
  base: string;
  /** Which conversation this screen is. `null` is a chat with no id — fixture
   *  mode, the CLI — which may only ever adopt an anonymous run. */
  chat: string | null;
  owns: Ownership;
  /** Beats that arrived before the probe said whose they were. */
  held: { readonly beat: AgentBeat; readonly index: number }[];
  /** Re-asks `/chat/state` who owns the epoch the stream just rebased to. */
  reprobe: () => void;
  /** How many beats of the current run have been folded in. */
  seen: number;
  /** Which run `seen` counts. 0 until the host names one. */
  epoch: number;
  /** The run the durable log ended on, so the probe can tell a finished run
   *  this conversation owns from somebody else's backlog. */
  restoredEpoch: number;
  stopped: boolean;
  rung: Rung;
  socket: BeatSocket | null;
  source: EventSource | null;
  /** The polling loop. */
  timer: ReturnType<typeof setTimeout> | null;
  /** The ladder's next move, up or down. */
  retry: ReturnType<typeof setTimeout> | null;
  /** The push rungs' liveness check — see beatReconcile.ts. */
  heartbeat: ReturnType<typeof setTimeout> | null;
  /** Consecutive heartbeats that caught the stream not delivering. */
  misses: number;
  /** Consecutive failures on the rung being attempted. */
  attempt: number;
  /**
   * Which rungs have opened at least once. A rung that has never worked gets
   * one try and then the ladder falls past it, so first paint is not held
   * behind a backoff for a transport this network plainly does not allow; a
   * rung that *did* work has earned the reconnects.
   */
  proven: Record<PushRung, boolean>;
  /** Consecutive failed attempts to climb back out of polling. */
  climb: number;
  failures: number;
  /** Why the ladder is on the rung it is on. */
  detail: string | null;
  /** Whether the polling rung has already reported itself as carrying beats. */
  announced: boolean;
};

export function newSession(
  emit: Emit,
  base: string,
  chat: string | null = null,
): StreamSession {
  return {
    emit,
    base,
    chat,
    owns: "unknown",
    held: [],
    reprobe: () => undefined,
    seen: 0,
    epoch: 0,
    restoredEpoch: 0,
    stopped: false,
    rung: "socket",
    socket: null,
    source: null,
    timer: null,
    retry: null,
    heartbeat: null,
    misses: 0,
    attempt: 0,
    proven: { socket: false, sse: false },
    climb: 0,
    failures: 0,
    detail: null,
    announced: false,
  };
}

export function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * The host says these indices belong to a different run than `seen` counts —
 * a second purchase, or a host that was restarted underneath the connection.
 * Either way the cursor is meaningless and starting over is the only reading
 * that neither skips beats nor repeats them.
 *
 * A different run may also be a different conversation, and the streamed beats
 * do not say which, so ownership goes back to unknown along with the cursor.
 * Whoever caused the rebase is responsible for asking again.
 */
export function rebaseTo(session: StreamSession, epoch: number): void {
  if (epoch === session.epoch) return;
  session.epoch = epoch;
  session.seen = 0;
  session.owns = "unknown";
  session.held = [];
}

export function clearTimers(session: StreamSession): void {
  session.socket?.close();
  session.socket = null;
  session.source?.close();
  session.source = null;
  if (session.timer !== null) clearTimeout(session.timer);
  session.timer = null;
  if (session.retry !== null) clearTimeout(session.retry);
  session.retry = null;
  if (session.heartbeat !== null) clearTimeout(session.heartbeat);
  session.heartbeat = null;
}

/** The host stopped answering. Say so once, then stand down. */
export function giveUp(session: StreamSession, detail: string): void {
  if (session.stopped) return;
  session.stopped = true;
  clearTimers(session);
  session.emit({ kind: "status", status: "offline", detail });
}
