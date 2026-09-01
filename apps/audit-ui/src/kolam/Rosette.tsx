// §3.3 Phase C / §5.6 — the covenant seal: one continuous stroke, an indigo
// ink bloom, and the product's single permitted decorative flourish (six
// radial hairlines — R4/§11: never saffron, exactly one flourish anywhere).
import { useEffect, useRef, type JSX, type RefObject } from "react";
import { animate, stagger } from "motion";
import { buildRosette } from "./rosette-path.ts";
import { EASE, HOLD_DURATION_MS } from "../motion/presets.ts";
import styles from "./Rosette.module.css";

export type RosetteStage = "idle" | "drawing" | "drawn";

type RosetteProps = {
  size?: number;
  stage: RosetteStage;
  reducedMotion: boolean;
  /** True while the seal is under the thumb: the line draws as you hold. */
  holding?: boolean;
};

const RADIAL_COUNT = 6;
const RADIAL_LENGTH = 18;

function radialHairlines(size: number): JSX.Element[] {
  const cx = size / 2;
  const cy = size / 2;
  const edge = size / 2 - 4;
  return Array.from({ length: RADIAL_COUNT }, (_, i) => {
    const angle = (i / RADIAL_COUNT) * 2 * Math.PI;
    const x1 = cx + edge * Math.cos(angle);
    const y1 = cy + edge * Math.sin(angle);
    const x2 = cx + (edge + RADIAL_LENGTH) * Math.cos(angle);
    const y2 = cy + (edge + RADIAL_LENGTH) * Math.sin(angle);
    return (
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        className={styles.hairline}
      />
    );
  });
}

/**
 * The stroke follows the thumb. Holding lays the kolam down over the same
 * 600 ms the signature takes, so the line and the commitment finish together;
 * letting go early pulls the ink back off the paper.
 */
function useHoldDraw(
  ink: RefObject<SVGPathElement | null>,
  holding: boolean,
  sealed: boolean,
  reducedMotion: boolean,
): void {
  useEffect(() => {
    const path = ink.current;
    if (path === null || sealed) return;
    if (reducedMotion) {
      path.style.strokeDashoffset = holding ? "0" : "1";
      return;
    }
    animate(
      path,
      { strokeDashoffset: holding ? [null, 0] : [null, 1] },
      holding
        ? { duration: HOLD_DURATION_MS / 1000, ease: "linear" }
        : { duration: 0.2, ease: EASE.out },
    );
  }, [ink, holding, sealed, reducedMotion]);
}

export function Rosette({
  size = 88,
  stage,
  reducedMotion,
  holding = false,
}: RosetteProps): JSX.Element {
  const groupRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const bloomRef = useRef<SVGPathElement>(null);
  const raysRef = useRef<SVGGElement>(null);
  const d = buildRosette(size / 2, size / 2, size / 4, size / 10);

  useHoldDraw(pathRef, holding, stage !== "idle", reducedMotion);

  useEffect(() => {
    if (stage !== "drawing") return;
    const group = groupRef.current;
    const path = pathRef.current;
    const bloom = bloomRef.current;
    const rays = raysRef.current;
    if (group === null || path === null || bloom === null) return;

    if (reducedMotion) {
      path.style.strokeDashoffset = "0";
      bloom.style.opacity = "0.1";
      return;
    }
    animate(
      group,
      { scale: [0.94, 1.06, 1] },
      { duration: 0.26, ease: EASE.stamp },
    );
    // From wherever the hold left the line, not from blank paper: a seal that
    // redrew itself on completion would read as a second, separate gesture.
    animate(
      path,
      { strokeDashoffset: [null, 0] },
      { duration: 0.3, ease: EASE.draw },
    );
    animate(
      bloom,
      { opacity: [0, 0.1] },
      { duration: 0.3, ease: EASE.out, delay: 0.12 },
    );
    if (rays !== null) {
      animate(
        Array.from(rays.children) as SVGLineElement[],
        { scaleX: [0, 1], opacity: [0.35, 0] },
        {
          duration: 0.32,
          ease: EASE.out,
          delay: stagger(0.02, { startDelay: 0.26 }),
        },
      );
    }
  }, [stage, reducedMotion]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={styles.rosette}
      aria-hidden="true"
    >
      <g ref={raysRef}>{radialHairlines(size)}</g>
      <g ref={groupRef}>
        <path
          ref={bloomRef}
          d={d}
          fillRule="evenodd"
          className={styles.bloom}
        />
        {/* The unlaid kolam: the shape is on the paper at rest so there is
            something to press, drawn faint enough to read as an invitation. */}
        <path d={d} className={`${styles.path} ${styles.ghost}`} />
        <path
          ref={pathRef}
          d={d}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1}
          className={styles.path}
        />
      </g>
    </svg>
  );
}
