import { useRef, useState } from "react";

export type HoldStage = "idle" | "holding" | "done";

export type HoldControls = {
  stage: HoldStage;
  start: () => void;
  abort: () => void;
  reset: () => void;
};

const HOLD_MS = 600;

/**
 * The product's signing gesture, verbatim: press and hold for 600ms, letting
 * go early pulls the ink back off the paper. Space held is the keyboard
 * equivalent; the components wire both to these two verbs.
 */
export function useHold(onComplete?: () => void): HoldControls {
  const [stage, setStage] = useState<HoldStage>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start(): void {
    if (timer.current !== null || stage === "done") return;
    setStage("holding");
    timer.current = setTimeout(() => {
      timer.current = null;
      setStage("done");
      onComplete?.();
    }, HOLD_MS);
  }

  function abort(): void {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
    setStage("idle");
  }

  function reset(): void {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setStage("idle");
  }

  return { stage, start, abort, reset };
}
