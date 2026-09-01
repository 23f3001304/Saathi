// The bottom rung. `GET /chat/state` carries the whole beat list, so polling
// loses no information — only the live reading — which is why the ladder can
// stand on it while it keeps trying to climb back.
import { parseChatState } from "../api/agentBeat.ts";
import { epochOf } from "./beatEvents.ts";
import { stateUrl } from "./beatScope.ts";
import { claim, drain } from "./beatFold.ts";
import {
  giveUp,
  MAX_POLL_FAILURES,
  messageOf,
  rebaseTo,
  type StreamSession,
} from "./beatSession.ts";

/**
 * A host too old to report an epoch still cannot shrink its own log within a
 * run, so a shorter list than `seen` says the same thing the epoch would.
 */
function adopt(session: StreamSession, epoch: number, length: number): void {
  if (epoch > 0) {
    rebaseTo(session, epoch);
    return;
  }
  if (length < session.seen) session.seen = 0;
}

/**
 * "Live, but polling" is a lie while the host answers nothing at all, so the
 * polling rung does not claim anything until a poll has come back. After that
 * it speaks only on the crossings — degraded when it is carrying beats again,
 * connecting when it stops — never once per tick.
 */
function pollFailed(session: StreamSession, cause: unknown): void {
  session.failures += 1;
  const detail = messageOf(cause);
  if (session.failures >= MAX_POLL_FAILURES) {
    giveUp(session, detail);
    return;
  }
  if (!session.announced) return;
  session.announced = false;
  session.detail = detail;
  session.emit({ kind: "status", status: "connecting", detail });
}

function pollRecovered(session: StreamSession): void {
  session.failures = 0;
  if (session.announced) return;
  session.announced = true;
  session.climb = 0;
  session.emit({ kind: "status", status: "degraded", detail: session.detail });
}

export async function pollOnce(session: StreamSession): Promise<void> {
  try {
    const res = await fetch(stateUrl(session));
    if (!res.ok) throw new Error(`chat/state → ${res.status}`);
    const raw: unknown = await res.json();
    const state = parseChatState(raw);
    if (state === null)
      throw new Error("chat/state returned an unreadable body");
    pollRecovered(session);
    adopt(session, epochOf(raw), state.beats.length);
    // This rung reads the one body that names the owner, so it settles
    // ownership itself rather than asking for it a second time.
    claim(session, state.conversation);
    drain(session, state.beats);
  } catch (cause) {
    pollFailed(session, cause);
  }
}
