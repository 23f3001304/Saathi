// §3.3 Phase B — "signing is press-and-hold for 600 ms, not a click." Linear
// progress is deliberate: an eased bar would lie about how long is left.
import {
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { animate } from "motion";
import { Rosette, type RosetteStage } from "../kolam/Rosette.tsx";
import { EASE, HOLD_DURATION_MS } from "../motion/presets.ts";
import styles from "./HoldToSign.module.css";

type HoldToSignProps = {
  stage: RosetteStage;
  reducedMotion: boolean;
  onComplete: () => void;
  label?: string;
  disabled?: boolean;
};

type HoldHandlers = { start: () => void; abort: () => void };

function useHoldHandlers(
  wrapperRef: RefObject<HTMLButtonElement | null>,
  ringRef: RefObject<SVGCircleElement | null>,
  onComplete: () => void,
  reducedMotion: boolean,
  setHolding: (held: boolean) => void,
): HoldHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start(): void {
    if (timer.current !== null) return;
    setHolding(true);
    if (wrapperRef.current !== null)
      animate(
        wrapperRef.current,
        { scale: [1, 0.94] },
        { duration: 0.09, ease: EASE.out },
      );
    if (ringRef.current !== null) {
      animate(
        ringRef.current,
        { strokeDashoffset: [1, 0] },
        {
          duration: reducedMotion ? 0.001 : HOLD_DURATION_MS / 1000,
          ease: "linear",
        },
      );
    }
    timer.current = setTimeout(() => {
      // Cleared before the callback so the release that follows a completed
      // hold cannot roll the seal back off the paper.
      timer.current = null;
      if (wrapperRef.current !== null)
        wrapperRef.current.style.transform = "scale(1)";
      onComplete();
    }, HOLD_DURATION_MS);
  }

  function abort(): void {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    if (ringRef.current !== null)
      animate(
        ringRef.current,
        { strokeDashoffset: [null, 1] },
        { duration: 0.2, ease: EASE.out },
      );
    if (wrapperRef.current !== null)
      animate(
        wrapperRef.current,
        { scale: [null, 1] },
        { duration: 0.12, ease: EASE.out },
      );
  }

  return { start, abort };
}

/** §7.4 — `Space` held is the keyboard equivalent, same 600 ms, same abort. */
export function HoldToSign({
  stage,
  reducedMotion,
  onComplete,
  label = "hold to sign",
  disabled = false,
}: HoldToSignProps): JSX.Element {
  const wrapperRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const [holding, setHolding] = useState(false);
  // The face of the control is lower case, like every label in the product;
  // the name announced to a screen reader is a sentence.
  const spoken = label.charAt(0).toUpperCase() + label.slice(1);
  const { start, abort } = useHoldHandlers(
    wrapperRef,
    ringRef,
    onComplete,
    reducedMotion,
    setHolding,
  );

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === " " && e.repeat === false) start();
  }
  function handleKeyUp(e: KeyboardEvent<HTMLButtonElement>): void {
    if (e.key === " ") abort();
  }
  function handlePointerDown(e: PointerEvent<HTMLButtonElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    start();
  }

  return (
    <button
      type="button"
      ref={wrapperRef}
      className={styles.wrap}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={abort}
      onPointerLeave={abort}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      aria-label={spoken}
    >
      <span className={styles.seal}>
        <Rosette
          stage={stage}
          reducedMotion={reducedMotion}
          holding={holding}
        />
        <svg
          className={styles.ring}
          viewBox="0 0 96 96"
          role="progressbar"
          aria-label="Hold progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={holding ? 100 : 0}
        >
          <circle
            ref={ringRef}
            cx={48}
            cy={48}
            r={44}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1}
            className={styles.progress}
          />
        </svg>
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
