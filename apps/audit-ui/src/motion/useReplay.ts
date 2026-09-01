import { useState, useCallback } from "react";

export type ReplaySpeed = 1 | 4;
export type ReplayState = {
  key: number;
  speed: ReplaySpeed;
  replay: (speed: ReplaySpeed) => void;
};

/**
 * §2.1 D22 — `⟲ replay` re-runs Moments (i)/(ii) rather than re-triggering
 * the attack harness. DECISION: implemented as a remount key — bumping it
 * forces SealRow/KolamThread to unmount and remount, which naturally
 * re-plays their entrance choreography from t=0 at the chosen speed; no
 * separate animation-scheduling engine is needed for a demo-scale replay.
 */
export function useReplay(): ReplayState {
  const [key, setKey] = useState(0);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);

  const replay = useCallback((nextSpeed: ReplaySpeed) => {
    setSpeed(nextSpeed);
    setKey((k) => k + 1);
  }, []);

  return { key, speed, replay };
}

/** Scales a base seconds duration by the inverse of replay speed (4× = ¼ time). */
export function scaledDuration(
  baseSeconds: number,
  speed: ReplaySpeed,
): number {
  return baseSeconds / speed;
}
