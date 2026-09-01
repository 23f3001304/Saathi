import type { JSX } from "react";
import styles from "./Meter.module.css";

type SegmentStyle =
  | "solid-ink"
  | "solid-indigo"
  | "solid-crimson"
  | "faint-ink"
  | "hatched-indigo";

export type MeterSegment = {
  fraction: number;
  style: SegmentStyle;
  label: string;
};

type MeterProps = {
  segments: MeterSegment[];
};

const STYLE_CLASS: Record<SegmentStyle, string> = {
  "solid-ink": styles["solid-ink"],
  "solid-indigo": styles["solid-indigo"],
  "solid-crimson": styles["solid-crimson"],
  "faint-ink": styles["faint-ink"],
  "hatched-indigo": styles["hatched-indigo"],
};

/** Shared stacked meter — EnvelopeBars' burn-down and MerchantTrust's score. */
export function Meter({ segments }: MeterProps): JSX.Element {
  return (
    <div
      className={styles.track}
      role="img"
      aria-label={segments.map((s) => s.label).join(", ")}
    >
      {segments.map((segment, i) => (
        <div
          key={i}
          className={`${styles.segment} ${STYLE_CLASS[segment.style]}`}
          style={{ width: `${Math.max(0, segment.fraction) * 100}%` }}
        />
      ))}
    </div>
  );
}
