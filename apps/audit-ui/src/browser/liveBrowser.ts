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
import { frameBurst } from "./browserFrames.ts";
import {
  get,
  handshake,
  post,
  Refused,
  rememberSession,
  scoped,
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
    const res = await get(
      wire.base,
      scoped("/browser/state", wire.conversation),
      wire.conversation,
    );
    if (!res.ok) throw new Error(`browser/state → ${res.status}`);
    wire.failures = 0;
    const view = parseSession(await res.json());
    wire.hasView = view !== null;
    rememberSession(view?.id ?? "", wire.conversation);
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
    const res = await get(
      wire.base,
      scoped("/browser/state", wire.conversation),
      wire.conversation,
    );
    if (!res.ok) throw new Error(`browser/state → ${res.status}`);
    return true;
  } catch (cause) {
    giveUp(wire, cause instanceof Refused ? "unauthorized" : "offline");
    return false;
  }
}

/** Opens the watch and hands back its teardown; `hold` is where the transport
 *  keeps the live wire so resume/takeover can force a state read on it. */
function startWatch(
  base: string,
  conversation: string | null,
  emit: BrowserEmit,
  hold: { wire: Wire | null },
): () => void {
  const started = wireOf(base, emit, conversation);
  hold.wire = started;
  emit({ kind: "status", status: "connecting" });
  void attachSession(started).then((ready) => {
    if (!started.stopped && ready) watch(started, emit);
  });
  return () => {
    stop(started);
    if (hold.wire === started) hold.wire = null;
  };
}

/** `/browser/open` relaunches when nothing is open, which is what a reaped
 *  window needs; it comes back under the lane's own id, so the persistent
 *  profile - cookies, the sign-in - comes back with it. */
async function reopen(
  base: string,
  lane: (path: string) => string,
  conversation: string | null,
  hold: { wire: Wire | null },
  url: string,
): Promise<void> {
  await post(base, lane("/browser/open"), { url }, conversation).catch(
    () => null,
  );
  if (hold.wire !== null) await readState(hold.wire);
}

export function liveBrowser(
  base: string,
  conversation: string | null = null,
): BrowserTransport {
  const lane = (path: string): string => scoped(path, conversation);
  const hold: { wire: Wire | null } = { wire: null };
  return {
    live: true,
    start: (emit) => startWatch(base, conversation, emit, hold),
    relay: async (input: RelayInput): Promise<RelayOutcome> => {
      try {
        const outcome = parseRelay(
          await post(base, lane("/browser/input"), input, conversation),
        );
        // The echo: repaint now, not at the next cast tick.
        if (hold.wire !== null) void frameBurst(hold.wire);
        return outcome;
      } catch {
        return parseRelay(null);
      }
    },
    resume: async () => {
      await post(base, lane("/browser/resume"), {}, conversation).catch(() => null);
      if (hold.wire !== null) await readState(hold.wire);
    },
    // The state read is not decoration: the chip and the drivable surface both
    // hang off `state`, so the card must not sit on `agent-drive` for up to a
    // poll interval after the wheel has actually moved.
    takeover: async () => {
      await post(base, lane("/browser/takeover"), {}, conversation).catch(() => null);
      if (hold.wire !== null) await readState(hold.wire);
    },
    restart: (url: string) => reopen(base, lane, conversation, hold, url),
    front: async () => {
      const body = await post(base, lane("/browser/front"), {}, conversation)
        .catch(() => null);
      return (body as { ok?: unknown } | null)?.ok === true;
    },
  };
}
