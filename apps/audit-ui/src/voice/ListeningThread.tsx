import type { JSX } from "react";
import {
  listeningPath,
  pulliPoints,
  THREAD_HEIGHT,
  THREAD_WIDTH,
} from "./listeningPath.ts";
import styles from "./MicButton.module.css";

type ListeningThreadProps = {
  /** Real RMS samples from the microphone, oldest first, each 0..1. */
  levels: readonly number[];
  /** True while the engine is transcribing: heard, not yet understood. */
  settling: boolean;
};

/**
 * What listening looks like. The thread is drawn from actual input amplitude,
 * so a muted microphone draws a flat line and a spoken sentence draws a wave —
 * which means this graphic answers "is it hearing me?", the one question a
 * decorative pulse can never answer.
 *
 * Under reduced motion the meter upstream is never started, so every sample
 * stays zero and this settles into a still kolam stroke rather than a
 * pretend-calm animation.
 */
export function ListeningThread({
  levels,
  settling,
}: ListeningThreadProps): JSX.Element {
  const pulli = pulliPoints(levels.length);
  const cy = THREAD_HEIGHT / 2;
  return (
    <svg
      className={
        settling ? `${styles.thread} ${styles.settling}` : styles.thread
      }
      viewBox={`0 0 ${THREAD_WIDTH} ${THREAD_HEIGHT}`}
      aria-hidden="true"
      focusable="false"
    >
      {pulli.map((x) => (
        <circle key={x} className={styles.pulli} cx={x} cy={cy} r="1.1" />
      ))}
      <path className={styles.stroke} d={listeningPath(levels)} />
    </svg>
  );
}
