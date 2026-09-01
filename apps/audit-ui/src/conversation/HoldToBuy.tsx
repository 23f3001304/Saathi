// The signature interaction: buying is a press-and-hold, never a click.
// A 600 ms linear sweep across the button, because an eased fill would lie
// about how much of the commitment is left. Releasing early retracts it —
// nothing is signed until the sweep completes.
import { useRef, type JSX, type KeyboardEvent, type PointerEvent } from "react";
import { animate } from "motion";
import { EASE, HOLD_DURATION_MS } from "../motion/presets.ts";
import { useReducedMotion } from "../motion/useReducedMotion.ts";
import styles from "./HoldToBuy.module.css";

type HoldToBuyProps = {
  label: string;
  busy: boolean;
  onComplete: () => void;
};

export function HoldToBuy({
  label,
  busy,
  onComplete,
}: HoldToBuyProps): JSX.Element {
  const fillRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useReducedMotion();

  function start(): void {
    if (busy || timer.current !== null) return;
    const seconds = reduced ? 0.001 : HOLD_DURATION_MS / 1000;
    if (fillRef.current !== null) {
      animate(
        fillRef.current,
        { transform: ["scaleX(0)", "scaleX(1)"] },
        { duration: seconds, ease: "linear" },
      );
    }
    timer.current = setTimeout(
      () => {
        timer.current = null;
        if (rootRef.current !== null)
          animate(
            rootRef.current,
            { scale: [0.98, 1] },
            { duration: 0.18, ease: EASE.stamp },
          );
        onComplete();
      },
      reduced ? 1 : HOLD_DURATION_MS,
    );
  }

  function abort(): void {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    if (fillRef.current !== null) {
      animate(
        fillRef.current,
        { transform: [null, "scaleX(0)"] },
        { duration: 0.18, ease: EASE.out },
      );
    }
  }

  function handlePointerDown(e: PointerEvent<HTMLButtonElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    start();
  }

  return (
    <button
      type="button"
      ref={rootRef}
      className={styles.hold}
      disabled={busy}
      aria-label={label}
      onPointerDown={handlePointerDown}
      onPointerUp={abort}
      onPointerLeave={abort}
      onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) =>
        e.key === " " && !e.repeat && start()
      }
      onKeyUp={(e: KeyboardEvent<HTMLButtonElement>) =>
        e.key === " " && abort()
      }
    >
      <span ref={fillRef} className={styles.fill} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </button>
  );
}
