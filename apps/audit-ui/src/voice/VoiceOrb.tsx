import type { JSX } from "react";
import {
  bloomPath,
  ORB_SIZE,
  petalCount,
  pulliRing,
  type OrbGeometry,
} from "./orbPath.ts";
import { orbLabel, type OrbPhase } from "./orbState.ts";
import styles from "./VoiceOrb.module.css";

const C = ORB_SIZE / 2;
const OUTER: OrbGeometry = { cx: C, cy: C, base: 84, reach: 22 };
const INNER: OrbGeometry = { cx: C, cy: C, base: 50, reach: 12 };
const PULLI_RADIUS = 112;

type VoiceOrbProps = {
  phase: OrbPhase;
  /** Real RMS samples from the microphone, oldest first, each 0..1. */
  levels: readonly number[];
  reducedMotion: boolean;
  onTap: () => void;
};

/**
 * Saathi's orb: a kolam bloom drawn around its pulli, opening on the actual
 * loudness of the room. Silence draws a ring, a spoken sentence draws petals,
 * so the form answers "is it hearing me?" rather than decorating the wait.
 *
 * The four states are told apart by colour and by form — indigo petals while
 * listening, a dashed line being retraced while thinking, a filled bloom
 * while speaking — so none of them depends on movement to be read.
 */
export function VoiceOrb({
  phase,
  levels,
  reducedMotion,
  onTap,
}: VoiceOrbProps): JSX.Element {
  const classes = [
    styles.orb,
    styles[phase],
    reducedMotion ? styles.still : "",
  ];
  const pulli = pulliRing(petalCount(levels.length), C, C, PULLI_RADIUS);
  return (
    <button
      type="button"
      className={classes.join(" ").trim()}
      aria-label={orbLabel(phase)}
      aria-disabled={phase === "thinking"}
      onClick={onTap}
    >
      <svg
        className={styles.figure}
        viewBox={`0 0 ${ORB_SIZE} ${ORB_SIZE}`}
        aria-hidden="true"
        focusable="false"
      >
        {pulli.map((point) => (
          <circle
            key={`${point.x}-${point.y}`}
            className={styles.pulli}
            cx={point.x}
            cy={point.y}
            r="1.4"
          />
        ))}
        <path className={styles.bloom} d={bloomPath(levels, OUTER)} />
        <path
          className={styles.stroke}
          pathLength={1}
          d={bloomPath(levels, OUTER)}
        />
        <path
          className={styles.inner}
          pathLength={1}
          d={bloomPath(levels, INNER)}
        />
        <circle className={styles.core} cx={C} cy={C} r="3.2" />
      </svg>
    </button>
  );
}
