// DECISION: `dev:fixtures` replays over a tiny in-app shim rather than a
// second dev server process — same `LedgerTransport` shape as the real SSE
// client (transport.ts), so LedgerProvider's wiring doesn't know the
// difference and the eventual gateway swap is config-only.
import type { LedgerFrame } from "./types.ts";
import type { LedgerTransport, LedgerTransportHandlers } from "./transport.ts";

const MIN_DELAY_MS = 40;
const MAX_DELAY_MS = 1200;

function delayBetween(
  prev: LedgerFrame | undefined,
  next: LedgerFrame,
): number {
  if (prev === undefined) return MIN_DELAY_MS;
  const delta = new Date(next.ts).getTime() - new Date(prev.ts).getTime();
  return Math.min(MAX_DELAY_MS, Math.max(MIN_DELAY_MS, delta));
}

export function connectFixtureTransport(
  frames: LedgerFrame[],
  handlers: LedgerTransportHandlers,
): LedgerTransport {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  handlers.onModeChange("sse");

  let elapsed = 0;
  let previous: LedgerFrame | undefined;
  for (const frame of frames) {
    elapsed += delayBetween(previous, frame);
    timers.push(
      setTimeout(() => {
        if (!cancelled) handlers.onFrame(frame);
      }, elapsed),
    );
    previous = frame;
  }

  return {
    close: () => {
      cancelled = true;
      timers.forEach((id) => clearTimeout(id));
    },
  };
}
