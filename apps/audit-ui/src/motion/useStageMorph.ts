// The dock transforms between pick → confirm → sign. A snap makes it read as
// three different screens; a short cross-fade with a rise makes it read as one
// surface answering one question at a time.
import { useEffect, useRef, type RefObject } from "react";
import { animate } from "motion";
import { EASE } from "./presets.ts";
import { useReducedMotion } from "./useReducedMotion.ts";

const RISE_PX = 6;
const DURATION_S = 0.24;

/** Re-plays whenever `stage` changes, skipping the first paint. */
export function useStageMorph(
  ref: RefObject<HTMLElement | null>,
  stage: string,
): void {
  const reduced = useReducedMotion();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const host = ref.current;
    const changed = previous.current !== null && previous.current !== stage;
    previous.current = stage;
    if (host === null || !changed) return;

    if (reduced) {
      animate(host, { opacity: [0, 1] }, { duration: 0.12, ease: "linear" });
      return;
    }
    animate(
      host,
      {
        opacity: [0, 1],
        transform: [`translateY(${RISE_PX}px)`, "translateY(0px)"],
      },
      { duration: DURATION_S, ease: EASE.out },
    );
  }, [ref, stage, reduced]);
}
