// Honest degradation, as a composition rather than a branch inside the hook.
//
// When the live transport reports itself offline, this swaps in the fixture
// reel so the screen is never empty — and swallows the reel's own
// `status: fixtures` so the UI keeps saying "offline, this is the reel"
// rather than quietly presenting a script as a run.
import type {
  AssistantSignal,
  AssistantTransport,
  Emit,
} from "./assistantTransport.ts";

function isOffline(signal: AssistantSignal): boolean {
  return signal.kind === "status" && signal.status === "offline";
}

export function resilientTransport(
  live: AssistantTransport,
  fallback: () => AssistantTransport,
): AssistantTransport {
  let active: AssistantTransport = live;
  return {
    live: true,
    start: (emit) => {
      let stopLive: (() => void) | null = null;
      let stopReel: (() => void) | null = null;
      const relay: Emit = (signal) => {
        emit(signal);
        if (!isOffline(signal) || stopReel !== null) return;
        stopLive?.();
        stopLive = null;
        active = fallback();
        stopReel = active.start((s) => {
          if (s.kind !== "status") emit(s);
        });
      };
      stopLive = live.start(relay);
      return () => {
        stopLive?.();
        stopReel?.();
      };
    },
    send: (text) => active.send(text),
    sign: (scope) => active.sign(scope),
  };
}
