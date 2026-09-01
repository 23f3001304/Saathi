// The disclosure beat: the Audit Instrument unfolding out of its collapsed
// trust summary. §3 vocabulary — EASE.out, 180ms, structural not decorative
// (R6), and a hard collapse to a 10ms opacity step under reduced motion.
import { useEffect, type RefObject } from "react";
import { animate } from "motion";
import { EASE } from "./presets.ts";
import { useReducedMotion } from "./useReducedMotion.ts";

const UNFOLD_S = 0.18;

/**
 * Animates `ref` in whenever `open` flips true. Height is deliberately not
 * animated: the instrument is a scroll container whose content height is
 * unknown until layout, and animating it would fight the scrollbar. The
 * unfold reads from the origin shift and the fade instead.
 */
export function useUnfold(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
): void {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!open || node === null) return;

    if (reducedMotion) {
      animate(node, { opacity: [0, 1] }, { duration: 0.01, ease: "linear" });
      return;
    }
    animate(
      node,
      { opacity: [0, 1], y: [-6, 0] },
      { duration: UNFOLD_S, ease: EASE.out },
    );
  }, [ref, open, reducedMotion]);
}
