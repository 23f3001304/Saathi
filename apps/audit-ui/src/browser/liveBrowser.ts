// The live side of the sandbox seam: agent-host owns the Chrome window, this
// file only looks at it and asks. Frames arrive over SSE where the runtime has
// an `EventSource` and over `GET /browser/frame` where it does not — the same
// arrangement, and the same reasoning, as agentStream.ts.
import type {
  BrowserEmit,
  BrowserTransport,
  RelayInput,
  RelayOutcome,
} from "./browserTransport.ts";
import {
  get,
  handshake,
  post,
  Refused,
  rememberSession,
} from "./browserKey.ts";
import { watchFrames } from "./browserFrames.ts";
import { giveUp, repeat, stop, wireOf } from "./browserPoll.ts";
import type { Wire } from "./browserPoll.ts";
import { parseRelay, parseSession } from "./browserWire.ts";

const STATE_INTERVAL_MS = 900;
/** Roughly three seconds of silence before the UI calls the host gone. */
const MAX_FAILURES = 4;

async function readState(wire: Wire): Promise<void> {
  try {
    const res = await get(wire.base, "/browser/state");
    if (!res.ok) throw new Error(`browser/state → ${res.status}`);
    wire.failures = 0;
    const view = parseSession(await res.json());
    rememberSession(view?.id ?? "");
    wire.emit({ kind: "session", view });
  } catch (cause) {
    if (cause instanceof Refused) return giveUp(wire, "unauthorized");
    wire.failures += 1;
    if (wire.failures >= MAX_FAILURES) giveUp(wire, "offline");
  }
}

/**
 * DECISION, reversed: the card watches for a window, it does not conjure one.
 *
 * It used to open a sandbox itself, on the reasoning that a panel sitting empty
 * until someone ran curl reads as broken. That was true while the sandbox was a
 * demo standing beside the product. It is not true now the buyer agent opens
 * windows of its own through `covenant_web` — a Chrome window appearing because
 * somebody glanced at a chat is a side effect nobody asked for, and it makes
 * the card mean "a browser exists" instead of "the agent is on the web".
 *
 * One frame over plain HTTP before the socket is trusted with any. The stream
 * carries the key in its query string, so anything wrong with that key shows
 * up as a card that never paints — which is exactly what it did. A fetched
 * first frame makes the window visible at once and leaves the socket to keep
 * it moving.
 */
function watch(wire: Wire, emit: BrowserEmit): void {
  emit({ kind: "status", status: "live" });
  repeat(wire, STATE_INTERVAL_MS, () => readState(wire));
  watchFrames(wire);
}

async function attachSession(wire: Wire): Promise<boolean> {
  try {
    await handshake(wire.base);
    const res = await get(wire.base, "/browser/state");
    if (!res.ok) throw new Error(`browser/state → ${res.status}`);
    return true;
  } catch (cause) {
    giveUp(wire, cause instanceof Refused ? "unauthorized" : "offline");
    return false;
  }
}

export function liveBrowser(base: string): BrowserTransport {
  let wire: Wire | null = null;
  return {
    live: true,
    start: (emit) => {
      const started = wireOf(base, emit);
      wire = started;
      emit({ kind: "status", status: "connecting" });
      void attachSession(started).then((ready) => {
        if (!started.stopped && ready) watch(started, emit);
      });
      return () => {
        stop(started);
        if (wire === started) wire = null;
      };
    },
    relay: async (input: RelayInput): Promise<RelayOutcome> => {
      try {
        return parseRelay(await post(base, "/browser/input", input));
      } catch {
        return parseRelay(null);
      }
    },
    resume: async () => {
      await post(base, "/browser/resume").catch(() => null);
      if (wire !== null) await readState(wire);
    },
    // The state read is not decoration: the chip and the drivable surface both
    // hang off `state`, so the card must not sit on `agent-drive` for up to a
    // poll interval after the wheel has actually moved.
    takeover: async () => {
      await post(base, "/browser/takeover").catch(() => null);
      if (wire !== null) await readState(wire);
    },
    front: async () => {
      const body = await post(base, "/browser/front").catch(() => null);
      return (body as { ok?: unknown } | null)?.ok === true;
    },
  };
}
