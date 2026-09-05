import { useEffect, useRef, type MutableRefObject } from "react";
import { prefersReducedMotion } from "../motion/reduced.ts";
import type { Tick } from "./contract.ts";

type TickRef = MutableRefObject<(tick: Tick) => void>;

/*
 * The one clock. A single requestAnimationFrame loop reads the scroll
 * position itself (there are no scroll listeners on this page, by house
 * rule) and hands the caller a tick: where the reader is, where the pointer
 * is, and how long the last frame took. The loop is cancelled while the tab
 * is hidden and picked up again when it comes back.
 *
 * Reduced motion does not stop the loop, because the scrubbing is the
 * reader's own motion and stopping it would freeze the page mid sentence.
 * What it does stop is the pointer parallax, the only movement the runtime
 * adds on its own.
 */

const MAX_STEP_MS = 100;

interface Pointer {
  x: number;
  y: number;
}

function progressNow(): number {
  const span = document.documentElement.scrollHeight - window.innerHeight;
  if (span <= 0) return 0;
  const p = window.scrollY / span;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}

/** Pointer in -1..1 over the viewport, resting at centre when it leaves. */
function trackPointer(pointer: Pointer): () => void {
  const parallax = !prefersReducedMotion();
  const move = (e: PointerEvent): void => {
    if (!parallax) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const leave = (): void => {
    pointer.x = 0;
    pointer.y = 0;
  };
  window.addEventListener("pointermove", move, { passive: true });
  window.addEventListener("pointerleave", leave);
  return () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerleave", leave);
  };
}

/** The loop itself: one frame at a time while the tab is being looked at. */
function runLoop(pointer: Pointer, tick: TickRef): () => void {
  let raf = 0;
  let last = performance.now();
  const frame = (now: number): void => {
    const dtMs = Math.min(now - last, MAX_STEP_MS);
    last = now;
    raf = requestAnimationFrame(frame);
    tick.current({
      progress: progressNow(),
      pointerX: pointer.x,
      pointerY: pointer.y,
      dtMs,
    });
  };
  const start = (): void => {
    if (raf !== 0) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = (): void => {
    if (raf === 0) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const visibility = (): void => (document.hidden ? stop() : start());
  document.addEventListener("visibilitychange", visibility);
  start();
  return () => {
    stop();
    document.removeEventListener("visibilitychange", visibility);
  };
}

export function useScrollProgress(onTick: (tick: Tick) => void): void {
  const tick = useRef(onTick);
  useEffect(() => {
    tick.current = onTick;
  }, [onTick]);

  useEffect(() => {
    const pointer: Pointer = { x: 0, y: 0 };
    const untrack = trackPointer(pointer);
    const stop = runLoop(pointer, tick);
    return () => {
      stop();
      untrack();
    };
  }, []);
}
