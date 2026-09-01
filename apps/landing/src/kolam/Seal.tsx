import { type JSX, type KeyboardEvent, type PointerEvent } from "react";
import { buildRosette } from "./rosette-path.ts";
import { useHold, type HoldStage } from "../motion/useHold.ts";
import styles from "./Seal.module.css";

/*
 * DECISION: the landing page does not describe the signing gesture, it
 * hands it to you. Same physics as the product: press and hold for 600ms,
 * the kolam seal draws itself under your thumb at linear speed (an eased
 * bar would lie about how long is left), and letting go early pulls the
 * ink back off the paper. Space held down is the keyboard equivalent.
 */
const RAY_COUNT = 6;

function Rays({ size }: { size: number }): JSX.Element {
  const c = size / 2;
  const edge = size / 2 - 6;
  return (
    <g className={styles.rays}>
      {Array.from({ length: RAY_COUNT }, (_, i) => {
        const a = (i / RAY_COUNT) * 2 * Math.PI;
        return (
          <line
            key={i}
            x1={c + edge * Math.cos(a)}
            y1={c + edge * Math.sin(a)}
            x2={c + (edge + 10) * Math.cos(a)}
            y2={c + (edge + 10) * Math.sin(a)}
          />
        );
      })}
    </g>
  );
}

type SealProps = {
  size?: number;
  label: string;
  doneLabel: string;
  onComplete?: () => void;
};

export function Seal({
  size = 88,
  label,
  doneLabel,
  onComplete,
}: SealProps): JSX.Element {
  const { stage, start, abort } = useHold(onComplete);
  const d = buildRosette(size / 2, size / 2, size / 4, size / 10);
  const done: HoldStage = "done";

  function onPointerDown(e: PointerEvent<HTMLButtonElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    start();
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === " " && !e.repeat) start();
  }

  return (
    <button
      type="button"
      className={styles.seal}
      data-stage={stage}
      aria-pressed={stage === done}
      onPointerDown={onPointerDown}
      onPointerUp={abort}
      onPointerCancel={abort}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === " ") abort();
      }}
    >
      <svg
        className={styles.figure}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <Rays size={size} />
        <path d={d} fillRule="evenodd" className={styles.bloom} />
        <path d={d} className={styles.ghost} />
        <path
          d={d}
          pathLength={1}
          strokeDasharray={1}
          className={styles.ink}
        />
      </svg>
      <span className={styles.label}>
        {stage === done ? doneLabel : label}
      </span>
    </button>
  );
}
