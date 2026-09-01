// §3.1 Moment (i) — per-seal stamp choreography. SealRow owns the overall
// sequence (container bounce, chain close, fiduciary/payment reveal via
// CSS — see Seal.module.css); this hook owns exactly the seven animations
// that land on one seal's own DOM parts.
import { useCallback } from "react";
import { animate } from "motion";
import { EASE } from "./presets.ts";
import { useReducedMotion } from "./useReducedMotion.ts";

export type SealElements = {
  container: SVGGElement;
  ring: SVGCircleElement;
  fill: SVGCircleElement;
  glyph: SVGGElement;
  label: HTMLElement;
};

function stampReduced(elements: SealElements): void {
  animate(
    elements.container,
    { opacity: [0, 1] },
    { duration: 0.1, ease: "linear" },
  );
  animate(
    elements.ring,
    { strokeDashoffset: [1, 0] },
    { duration: 0.1, ease: "linear" },
  );
  animate(
    elements.fill,
    { opacity: [0, 0.12] },
    { duration: 0.1, ease: "linear" },
  );
  animate(
    elements.glyph,
    { opacity: [0.22, 1] },
    { duration: 0.1, ease: "linear" },
  );
  animate(
    elements.label,
    { opacity: [0, 1] },
    { duration: 0.1, ease: "linear" },
  );
}

function stampFull(elements: SealElements, delay: number): void {
  animate(
    elements.container,
    { scale: [1.14, 1] },
    { duration: 0.16, ease: EASE.stamp, delay },
  );
  animate(
    elements.container,
    { opacity: [0, 1] },
    { duration: 0.12, ease: EASE.out, delay },
  );
  animate(
    elements.ring,
    { strokeDashoffset: [1, 0] },
    { duration: 0.2, ease: EASE.draw, delay },
  );
  animate(
    elements.fill,
    { scale: [0.6, 1], opacity: [0, 0.12] },
    { duration: 0.22, ease: EASE.out, delay: delay + 0.04 },
  );
  animate(
    elements.glyph,
    { opacity: [0.22, 1] },
    { duration: 0.14, ease: EASE.out, delay: delay + 0.02 },
  );
  animate(
    elements.label,
    { opacity: [0, 1], y: [3, 0] },
    { duration: 0.12, ease: EASE.out, delay: delay + 0.08 },
  );
}

/** Returns a function that stamps one seal; `delayMs` is SealRow's per-row stagger (§4.5 `stampDelayMs`). */
export function useStamp(): (elements: SealElements, delayMs: number) => void {
  const reducedMotion = useReducedMotion();
  return useCallback(
    (elements: SealElements, delayMs: number) => {
      if (reducedMotion) {
        stampReduced(elements);
        return;
      }
      stampFull(elements, delayMs / 1000);
    },
    [reducedMotion],
  );
}
