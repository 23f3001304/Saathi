type Bezier = [number, number, number, number];
export declare const EASE: {
    out: Bezier;
    stamp: Bezier;
    snap: Bezier;
    draw: Bezier;
};
export declare const SPRING_RECOIL: {
    readonly type: "spring";
    readonly stiffness: 520;
    readonly damping: 22;
    readonly mass: 0.6;
};
/** Moment (i): base per-seal stagger, seconds. */
export declare const SEAL_STAGGER_S = 0.09;
/** §5.5: the thread splits with this Y offset (px) at a break. */
export declare const BREAK_GAP_PX = 14;
/** Phase B of Moment (iii): press-and-hold duration, ms. */
export declare const HOLD_DURATION_MS = 600;
export {};
//# sourceMappingURL=presets.d.ts.map