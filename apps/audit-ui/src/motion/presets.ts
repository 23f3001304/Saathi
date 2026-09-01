// §3 — Motion One vocabulary, verbatim from frontend-screens.md. Every
// choreographed moment (SealRow, ThreadBreak, SigningSheet) imports from
// here rather than inlining an easing curve or a duration.
// Cast to a mutable 4-tuple: motion's `Easing` (BezierDefinition) type
// rejects a readonly tuple even though the values themselves never mutate.
type Bezier = [number, number, number, number];
export const EASE = {
  out: [0.25, 1, 0.5, 1] as Bezier,
  stamp: [0.34, 1.2, 0.64, 1] as Bezier,
  snap: [0.7, 0, 0.84, 0] as Bezier,
  draw: [0.16, 0.84, 0.44, 1] as Bezier,
};

export const SPRING_RECOIL = {
  type: "spring",
  stiffness: 520,
  damping: 22,
  mass: 0.6,
} as const;

/** Moment (i): base per-seal stagger, seconds. */
export const SEAL_STAGGER_S = 0.09;

/** §5.5: the thread splits with this Y offset (px) at a break. */
export const BREAK_GAP_PX = 14;

/** Phase B of Moment (iii): press-and-hold duration, ms. */
export const HOLD_DURATION_MS = 600;
