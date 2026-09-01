import type { JSX } from "react";
import { currentLine, type OrbPhase, type SpokenParts } from "./orbState.ts";
import styles from "./VoiceMode.module.css";

type VoiceTranscriptProps = {
  phase: OrbPhase;
  parts: SpokenParts;
};

/**
 * The words, one measure wide and centred under the bloom. A guess is quiet
 * and what was actually said is ink, so the difference between "I think you
 * said" and "you said" needs no label to be read.
 *
 * The element stays mounted with nothing in it so the line does not shove the
 * orb up the screen every time a turn starts.
 */
export function VoiceTranscript({
  phase,
  parts,
}: VoiceTranscriptProps): JSX.Element {
  const line = currentLine(phase, parts);
  return <p className={`${styles.line} ${styles[line.tone]}`}>{line.text}</p>;
}
