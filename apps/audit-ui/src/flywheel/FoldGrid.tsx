import type { JSX } from "react";
import type { FoldSummary } from "../api/types.ts";
import { FoldTile } from "./FoldTile.tsx";
import styles from "./FoldGrid.module.css";

type FoldGridProps = {
  folds: FoldSummary;
  onSelect?: (fold: string) => void;
};

/** §2.3 — deterministic materialised views, not a recommendation engine. */
export function FoldGrid({ folds, onSelect }: FoldGridProps): JSX.Element {
  return (
    <div className={styles.grid} role="list" aria-label="Folds">
      {folds.map((fold) => (
        <FoldTile
          key={fold.fold}
          fold={fold}
          onSelect={() => onSelect?.(fold.fold)}
        />
      ))}
    </div>
  );
}
