// The bookkeeping every poller on this seam shares: what is still running,
// how to stop it, and when to give up on the host. Split out so liveBrowser.ts
// and browserFrames.ts can both hold the same wire without one importing the
// other.
import type { BrowserEmit } from "./browserTransport.ts";

export interface Wire {
  readonly base: string;
  /** Which lane's window this card watches; `null` is the primary. */
  readonly conversation: string | null;
  readonly emit: BrowserEmit;
  stopped: boolean;
  failures: number;
  source: EventSource | null;
  /** When a picture last reached the card. `0` means never; see browserFrames. */
  painted: number;
  /** Whether the last state read named a live window. Frame reads without
   *  one are guaranteed 404s, and three background chats polling them
   *  filled real consoles with real noise. */
  hasView: boolean;
  /** Whether an input-echo burst is already in flight; see browserFrames. */
  bursting: boolean;
  timers: ReturnType<typeof setTimeout>[];
}

export function wireOf(
  base: string,
  emit: BrowserEmit,
  conversation: string | null = null,
): Wire {
  return {
    base,
    conversation,
    emit,
    stopped: false,
    failures: 0,
    bursting: false,
    source: null,
    painted: 0,
    hasView: false,
    timers: [],
  };
}

export function stop(wire: Wire): void {
  wire.stopped = true;
  wire.source?.close();
  wire.source = null;
  for (const timer of wire.timers) clearTimeout(timer);
  wire.timers = [];
}

export function giveUp(wire: Wire, status: "offline" | "unauthorized"): void {
  if (wire.stopped) return;
  stop(wire);
  wire.emit({ kind: "status", status });
}

export function repeat(
  wire: Wire,
  everyMs: number,
  tick: () => Promise<void>,
): void {
  const run = (): void => {
    if (wire.stopped) return;
    void tick().then(() => {
      if (!wire.stopped) wire.timers.push(setTimeout(run, everyMs));
    });
  };
  run();
}
