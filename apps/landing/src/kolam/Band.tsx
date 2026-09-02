import type { JSX } from "react";
import styles from "./Band.module.css";

/*
 * DECISION: the kolam asset is constructed, not sketched. A real kolam is
 * geometry: a row of pulli dots and loops drawn around them with a steady
 * hand, and the freehand bezier this replaces read as a scribble against
 * it. Two mirrored serpentines woven through one dot row form the classic
 * chain: every arc a true semicircle, every link identical, the whole band
 * one repeatable unit. Precision is the point; it is what makes it read as
 * a drawn welcome instead of decoration.
 */

const CELL = 44;
const MID = 22;
const R = 22;

function serpentine(count: number, flip: boolean): string {
  let d = `M 0 ${MID}`;
  for (let i = 0; i < count; i += 1) {
    const sweep = (i % 2 === 0) !== flip ? 1 : 0;
    d += ` A ${R} ${R} 0 0 ${sweep} ${(i + 1) * CELL} ${MID}`;
  }
  return d;
}

export function Band({
  links = 12,
  className,
}: {
  links?: number;
  className?: string;
}): JSX.Element {
  const width = links * CELL;
  return (
    <svg
      className={[styles.band, className ?? ""].join(" ")}
      viewBox={`0 0 ${width} ${CELL}`}
      width={width}
      height={CELL}
      aria-hidden="true"
    >
      <path className={styles.strand} d={serpentine(links, false)} />
      <path className={styles.strand} d={serpentine(links, true)} />
      {Array.from({ length: links }, (_, i) => (
        <circle
          key={i}
          className={styles.pulli}
          cx={i * CELL + MID}
          cy={MID}
          r={2.4}
        />
      ))}
    </svg>
  );
}
