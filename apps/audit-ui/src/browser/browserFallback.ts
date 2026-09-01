// Honest degradation for the sandbox card, as a composition rather than a
// branch inside the hook — the same shape as resilientTransport.ts, with the
// climb the beat ladder already has (beatLadder.ts).
//
// Two rules hold here and the card depends on both. The reel never inherits
// the live transport's status, so the screen keeps saying "offline" rather
// than quietly presenting a script as a window; and falling is not a one-way
// door, so a blip costs a few seconds rather than the rest of the session.
import type { MutableRefObject } from "react";
import type { BrowserBlackout, BrowserSessionView } from "./browserSession.ts";
import type {
  BrowserFrame,
  BrowserSignal,
  BrowserStatus,
  BrowserTransport,
} from "./browserTransport.ts";
import { fixtureBrowser } from "./fixtureBrowser.ts";

export interface BrowserSinks {
  readonly setView: (view: BrowserSessionView | null) => void;
  readonly setFrame: (frame: BrowserFrame | null) => void;
  readonly setBlackout: (blackout: BrowserBlackout | null) => void;
  readonly setStatus: (status: BrowserStatus) => void;
}

/**
 * Bounded, and it never stops: the reel is a rung, not a destination.
 *
 * DECISION (was 2/5/15/30s): the ceiling is five seconds. Why: the old ladder
 * spent itself while the host was down and then checked once every thirty
 * seconds, so a measured restart had the host answering at +27s and the card
 * still on the OFFLINE banner at +56s — the banner promises the card comes
 * back on its own, and half a minute of it standing there is not that promise
 * kept. An attempt is one unauthenticated GET to the host that this page is
 * already configured to talk to, and the conversation's own ladder polls that
 * host ten times as often while it is down (beatSession.ts).
 */
const CLIMB_BACKOFF_MS = [2_000, 5_000];

interface Rig {
  readonly slot: MutableRefObject<BrowserTransport | null>;
  readonly make: () => BrowserTransport;
  readonly sinks: BrowserSinks;
  live: BrowserTransport | null;
  stopLive: (() => void) | null;
  stopReel: (() => void) | null;
  climb: number;
  retry: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
}

function paint(rig: Rig, signal: BrowserSignal): void {
  if (signal.kind === "session") rig.sinks.setView(signal.view);
  if (signal.kind === "frame") {
    rig.sinks.setFrame(signal.frame);
    rig.sinks.setBlackout(null);
  }
  // The last picture is dropped, not held: a stale frame under a curtain is a
  // picture of the window still sitting in this page's memory.
  if (signal.kind === "blackout") {
    rig.sinks.setFrame(null);
    rig.sinks.setBlackout(signal.blackout);
  }
}

function startReel(rig: Rig): void {
  // Frames belong to a window that is gone; drop them rather than freeze one.
  rig.sinks.setFrame(null);
  rig.sinks.setBlackout(null);
  const reel = fixtureBrowser();
  rig.slot.current = reel;
  rig.stopReel = reel.start((signal) => {
    if (signal.kind === "session") rig.sinks.setView(signal.view);
  });
}

function scheduleClimb(rig: Rig): void {
  if (rig.stopped || rig.retry !== null) return;
  const at = Math.min(rig.climb, CLIMB_BACKOFF_MS.length - 1);
  rig.climb += 1;
  rig.retry = setTimeout(() => {
    rig.retry = null;
    if (!rig.stopped) connect(rig);
  }, CLIMB_BACKOFF_MS[at] ?? 0);
}

function fall(rig: Rig): void {
  rig.stopLive?.();
  rig.stopLive = null;
  rig.sinks.setStatus("offline");
  if (rig.stopReel === null) startReel(rig);
  scheduleClimb(rig);
}

/**
 * The live transport answered. The reel stands down either way — an answer is
 * an answer — but only a working one blanks the card, because the reel's last
 * view under a `live` banner is the exact lie this file exists to prevent.
 */
function answered(rig: Rig, status: BrowserStatus): void {
  const wasReel = rig.stopReel !== null;
  rig.stopReel?.();
  rig.stopReel = null;
  rig.slot.current = rig.live;
  rig.climb = 0;
  if (rig.retry !== null) clearTimeout(rig.retry);
  rig.retry = null;
  if (status !== "live" || !wasReel) return;
  rig.sinks.setView(null);
  rig.sinks.setFrame(null);
  rig.sinks.setBlackout(null);
}

function onStatus(rig: Rig, status: BrowserStatus): void {
  if (status === "offline") {
    fall(rig);
    return;
  }
  // While the reel is standing in, a fresh attempt's "connecting" is not news
  // about what is on screen. Only an answer is.
  if (rig.stopReel !== null && status === "connecting") return;
  if (status === "live" || status === "unauthorized") answered(rig, status);
  rig.sinks.setStatus(status);
}

function connect(rig: Rig): void {
  const live = rig.make();
  rig.live = live;
  // `slot` is what a click reaches, so it moves to a candidate only once there
  // is a window behind it; until then the reel keeps refusing, truthfully.
  if (rig.stopReel === null) rig.slot.current = live;
  rig.stopLive = live.start((signal) => {
    if (signal.kind === "status") return onStatus(rig, signal.status);
    if (rig.stopReel === null) paint(rig, signal);
  });
}

export function attach(
  slot: MutableRefObject<BrowserTransport | null>,
  make: () => BrowserTransport,
  sinks: BrowserSinks,
): () => void {
  const rig: Rig = {
    slot,
    make,
    sinks,
    live: null,
    stopLive: null,
    stopReel: null,
    climb: 0,
    retry: null,
    stopped: false,
  };
  connect(rig);
  return () => {
    rig.stopped = true;
    if (rig.retry !== null) clearTimeout(rig.retry);
    rig.stopLive?.();
    rig.stopReel?.();
    slot.current = null;
  };
}
