import type { JSX } from "react";
import styles from "./SortKeyBanner.module.css";

type SortKeyBannerProps = {
  sortKey: string;
  memoryLabel: string;
  onChange?: (key: string) => void;
};

const SORT_OPTIONS = [
  "total landed cost, ascending",
  "rating, descending",
  "delivery time, ascending",
];

/**
 * §5.7/§2.1 — always visible above an OptionSet, never collapsible: the
 * sort is declared, and its provenance ("from your P3 preference, no
 * sponsored placement") is on screen, not in a tooltip.
 */
export function SortKeyBanner({
  sortKey,
  memoryLabel,
  onChange,
}: SortKeyBannerProps): JSX.Element {
  return (
    <div className={styles.banner}>
      <div className={styles.line}>
        <span>sorted by</span>
        <select
          className={styles.select}
          value={sortKey}
          onChange={(e) => onChange?.(e.target.value)}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <span className={styles.provenance}>
        from {memoryLabel} · no sponsored placement
      </span>
    </div>
  );
}
