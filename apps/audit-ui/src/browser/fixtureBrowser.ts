// The reel, wearing the transport's shape. It exists so the card has one code
// path: with no agent-host running the panel still tells the story, and it says
// out loud that nothing is behind the picture.
import type { BrowserTransport, RelayOutcome } from "./browserTransport.ts";
import { REEL_HAS_NO_WINDOW } from "./browserTransport.ts";
import { AFTER_RESUME, BROWSER_REEL } from "./browserFixture.ts";

const NO_WINDOW: RelayOutcome = {
  ok: false,
  human: REEL_HAS_NO_WINDOW,
  handOffNatively: false,
  nativeEntry: null,
  fronted: false,
  surface: null,
  openUrl: null,
};

export function fixtureBrowser(): BrowserTransport {
  let resumed = false;
  let emitResume: (() => void) | null = null;
  return {
    live: false,
    start: (emit) => {
      emit({ kind: "status", status: "fixtures" });
      const timers = BROWSER_REEL.map((beat) =>
        setTimeout(() => {
          if (!resumed) emit({ kind: "session", view: beat.view });
        }, beat.at),
      );
      emitResume = () => emit({ kind: "session", view: AFTER_RESUME });
      return () => {
        for (const timer of timers) clearTimeout(timer);
        emitResume = null;
      };
    },
    relay: () => Promise.resolve(NO_WINDOW),
    /** There is no wheel to take: the reel has no window behind it. */
    takeover: () => Promise.resolve(),
    resume: () => {
      resumed = true;
      emitResume?.();
      return Promise.resolve();
    },
    restart: () => Promise.resolve(),
    front: () => Promise.resolve(false),
  };
}
