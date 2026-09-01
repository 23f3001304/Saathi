// Cards arrive rather than appear: a short staggered rise, so the buyer sees
// the agent laying options down one at a time instead of a grid snapping in.
import { useEffect, type RefObject } from "react";
import { animate, stagger } from "motion";
import { EASE } from "./presets.ts";
import { useReducedMotion } from "./useReducedMotion.ts";

const RISE_PX = 10;
const DURATION_S = 0.34;
const STAGGER_S = 0.07;

/** Animates the direct children of `ref` whenever `key` changes. */
export function useReveal(
  ref: RefObject<HTMLElement | null>,
  key: string | number,
): void {
  const reduced = useReducedMotion();

  useEffect(() => {
    const host = ref.current;
    if (host === null) return;
    const items = Array.from(host.children) as HTMLElement[];
    if (items.length === 0) return;

    if (reduced) {
      animate(items, { opacity: [0, 1] }, { duration: 0.12, ease: "linear" });
      return;
    }
    animate(
      items,
      {
        opacity: [0, 1],
        transform: [`translateY(${RISE_PX}px)`, "translateY(0px)"],
      },
      { duration: DURATION_S, ease: EASE.out, delay: stagger(STAGGER_S) },
    );
  }, [ref, key, reduced]);
}
