import { useEffect, useRef, type JSX } from "react";
import { animate } from "motion";
import {
  buildBrokenThread,
  pulliCenter,
  BREAK_GAP,
  PITCH,
  type ThreadEvent,
} from "./thread.ts";
import { EASE, SPRING_RECOIL } from "../motion/presets.ts";
import { Knot } from "./Knot.tsx";
import styles from "./ThreadBreak.module.css";

type ThreadBreakProps = {
  events: ThreadEvent[];
  breakIndex: number;
  x0: number;
  y0: number;
  reducedMotion: boolean;
  onKnotClick?: (id: number) => void;
};

/** §3.2/§5.5 — the crimson flood + recoil are the two beats that carry the
 * moment; fray hairlines and the gate glyph are CSS (ThreadBreak.module.css). */
export function ThreadBreak({
  events,
  breakIndex,
  x0,
  y0,
  reducedMotion,
  onKnotClick,
}: ThreadBreakProps): JSX.Element {
  const floodRef = useRef<SVGPathElement>(null);
  const aboveRef = useRef<SVGGElement>(null);
  const belowRef = useRef<SVGGElement>(null);
  const { above, below } = buildBrokenThread(events, breakIndex, x0, y0);
  const aboveEvents = events.slice(0, breakIndex + 1);
  const belowEvents = events.slice(breakIndex + 1);
  const belowY0 = y0 + (breakIndex + 1) * PITCH + BREAK_GAP;
  const gateEvent = events[breakIndex] ?? aboveEvents[0];
  const gateCenter =
    gateEvent !== undefined
      ? pulliCenter(gateEvent, breakIndex, x0, y0)
      : { x: x0, y: y0 };

  useEffect(() => {
    if (reducedMotion) return;
    const flood = floodRef.current;
    if (flood !== null) {
      flood.style.clipPath = "inset(0 0 100% 0)";
      animate(
        flood,
        { clipPath: ["inset(0 0 100% 0)", "inset(0 0 0% 0)"] },
        { duration: 0.2, ease: EASE.snap },
      );
    }
    if (aboveRef.current !== null)
      animate(aboveRef.current, { y: [0, -3] }, SPRING_RECOIL);
    if (belowRef.current !== null)
      animate(belowRef.current, { y: [0, 11] }, SPRING_RECOIL);
    // Deliberately keyed on breakIndex, not on `events` — a new break should
    // re-run this; new non-attack events appended below it should not.
  }, [breakIndex, reducedMotion]);

  return (
    <>
      <path ref={floodRef} d={above} className={styles.crimsonFlood} />
      <g ref={aboveRef}>
        <path d={above} className={styles.settled} />
        {aboveEvents.map((event, i) => (
          <Knot
            key={event.id}
            {...pulliCenter(event, i, x0, y0)}
            kind={event.knot}
            status={event.status}
            onActivate={() => onKnotClick?.(event.id)}
          />
        ))}
      </g>
      <line
        x1={gateCenter.x - 5}
        y1={gateCenter.y}
        x2={gateCenter.x + 5}
        y2={gateCenter.y}
        className={styles.gate}
      />
      <g ref={belowRef} className={styles.below}>
        <path d={below} className={styles.settled} />
        {belowEvents.map((event, i) => (
          <Knot
            key={event.id}
            {...pulliCenter(event, i, x0, belowY0)}
            kind={event.knot}
            status={event.status}
            onActivate={() => onKnotClick?.(event.id)}
          />
        ))}
      </g>
    </>
  );
}
