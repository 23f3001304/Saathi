import {
  useEffect,
  useRef,
  useState,
  type JSX,
  type RefObject,
} from "react";
import { buildThreadPath, knotCentres, THREAD_X } from "./threadPath.ts";
import { prefersReducedMotion } from "../motion/reduced.ts";
import styles from "./Thread.module.css";

/*
 * DECISION: the deed's margin carries one continuous kolam thread, drawn by
 * the reader's own scroll. A kolam is a threshold drawing: an unbroken line
 * laid at the door to welcome a guest, and an unbroken line is precisely
 * this product's claim about its audit trail. So the line is not decoration
 * on the page, it is the page's argument: it starts at the preamble, ties a
 * ring at every clause you pass, and reaches the signature only if you do.
 * Scroll is the only driver (one rAF-throttled listener, stroke-dashoffset
 * only); under reduced motion, and before hydration, the thread is simply
 * laid in full, the way a finished kolam meets the morning.
 */
type Geometry = { height: number; knots: number[] };

function measure(host: HTMLElement): Geometry {
  const knots = Array.from(
    host.querySelectorAll<HTMLElement>("[data-clause]"),
  ).map((el) => el.offsetTop + 4);
  return { height: host.scrollHeight, knots };
}

function progressOf(host: HTMLElement): number {
  const top = host.getBoundingClientRect().top + window.scrollY;
  const read = window.scrollY + window.innerHeight - top;
  return Math.min(1, Math.max(0, read / host.scrollHeight));
}

function useThreadDraw(
  hostRef: RefObject<HTMLElement | null>,
  pathRef: RefObject<SVGPathElement | null>,
  setGeometry: (g: Geometry) => void,
): void {
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    // The observer must not feed on itself: reveal transitions translate
    // elements, which nudges the host's scrollHeight every animation frame,
    // and an unguarded observer answered each nudge with a setState and a
    // re-render of this whole SVG: the loop that froze the page. One rAF
    // coalesces a burst; the compare drops any measure that changed nothing.
    let last: Geometry = { height: 0, knots: [] };
    const same = (a: Geometry, b: Geometry): boolean =>
      Math.abs(a.height - b.height) < 2 &&
      a.knots.length === b.knots.length &&
      a.knots.every((k, i) => Math.abs(k - (b.knots[i] ?? 0)) < 2);
    const update = (): void => {
      const next = measure(host);
      if (same(next, last)) return;
      last = next;
      setGeometry(next);
    };
    update();
    let roRaf = 0;
    const ro = new ResizeObserver(() => {
      if (roRaf !== 0) return;
      roRaf = requestAnimationFrame(() => {
        roRaf = 0;
        update();
      });
    });
    ro.observe(host);

    if (prefersReducedMotion()) {
      if (pathRef.current !== null)
        pathRef.current.style.strokeDashoffset = "0";
      return () => ro.disconnect();
    }
    let raf = 0;
    const draw = (): void => {
      raf = 0;
      if (pathRef.current !== null)
        pathRef.current.style.strokeDashoffset = String(1 - progressOf(host));
    };
    const onScroll = (): void => {
      if (raf === 0) raf = requestAnimationFrame(draw);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [hostRef, pathRef, setGeometry]);
}

export function Thread({
  hostRef,
}: {
  hostRef: RefObject<HTMLElement | null>;
}): JSX.Element {
  const pathRef = useRef<SVGPathElement>(null);
  const [geometry, setGeometry] = useState<Geometry>({ height: 0, knots: [] });
  useThreadDraw(hostRef, pathRef, setGeometry);

  if (geometry.height === 0) return <span className={styles.rail} />;
  return (
    <span className={styles.rail} aria-hidden="true">
      <svg
        className={styles.svg}
        width={76}
        height={geometry.height}
        viewBox={`0 0 76 ${geometry.height}`}
      >
        {knotCentres(geometry.knots).map((y) => (
          <circle key={y} className={styles.pulli} cx={THREAD_X} cy={y} r={2} />
        ))}
        <path
          ref={pathRef}
          className={styles.ink}
          d={buildThreadPath(geometry.height, geometry.knots)}
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1}
        />
      </svg>
    </span>
  );
}
