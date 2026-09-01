// §5.4 — the live segment draws in on append; the knot follows at +0.24s;
// the view auto-scrolls only if the head is already near the fold.
import { useEffect, useRef, type RefObject } from "react";
import { animate } from "motion";
import { EASE } from "./presets.ts";
import { useReducedMotion } from "./useReducedMotion.ts";

const AUTO_SCROLL_THRESHOLD_PX = 120;
const KNOT_DELAY_S = 0.24;

function autoScroll(container: HTMLElement | null): void {
  if (container === null) return;
  const distanceFromBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight;
  if (distanceFromBottom < AUTO_SCROLL_THRESHOLD_PX) {
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }
}

/** The one new segment: the thread draws, then its knot lands. */
function drawSegment(
  path: SVGPathElement,
  knot: SVGGElement | null,
  reducedMotion: boolean,
): void {
  if (reducedMotion) {
    path.style.strokeDashoffset = "0";
    if (knot !== null) {
      knot.style.opacity = "1";
      knot.style.transform = "scale(1)";
    }
    return;
  }
  animate(
    path,
    { strokeDashoffset: [1, 0] },
    { duration: 0.42, ease: EASE.draw },
  );
  if (knot !== null) {
    animate(
      knot,
      { opacity: [0, 1], scale: [0.7, 1] },
      { duration: 0.16, ease: EASE.stamp, delay: KNOT_DELAY_S },
    );
  }
}

export function useThreadGrowth(
  containerRef: RefObject<HTMLElement | null>,
  livePathRef: RefObject<SVGPathElement | null>,
  liveKnotRef: RefObject<SVGGElement | null>,
  eventCount: number,
): void {
  const reducedMotion = useReducedMotion();
  const prevCount = useRef(eventCount);

  useEffect(() => {
    const grew = eventCount > prevCount.current;
    prevCount.current = eventCount;
    if (!grew) return;

    const path = livePathRef.current;
    const knot = liveKnotRef.current;
    if (path === null) return;

    drawSegment(path, knot, reducedMotion);
    autoScroll(containerRef.current);
  }, [eventCount, reducedMotion, containerRef, livePathRef, liveKnotRef]);
}
