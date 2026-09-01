import { useEffect, useRef, useState, type JSX } from "react";
import type { FoldTileSummary } from "../api/types.ts";
import styles from "./FoldTile.module.css";

type FoldTileProps = {
  fold: FoldTileSummary;
  onSelect?: () => void;
};

/** §2.3 — a 220ms L→R sweep + 300ms border flash whenever the number changes. */
export function FoldTile({ fold, onSelect }: FoldTileProps): JSX.Element {
  const [recomputing, setRecomputing] = useState(false);
  const prevHeadline = useRef(fold.headline);

  useEffect(() => {
    if (prevHeadline.current !== fold.headline) {
      setRecomputing(true);
      const id = setTimeout(() => setRecomputing(false), 300);
      prevHeadline.current = fold.headline;
      return () => clearTimeout(id);
    }
    return undefined;
  }, [fold.headline]);

  return (
    <button
      type="button"
      className={
        recomputing ? `${styles.tile} ${styles.recomputing}` : styles.tile
      }
      onClick={onSelect}
    >
      {recomputing && <span className={styles.sweep} aria-hidden="true" />}
      <div className={styles.headline}>{fold.headline}</div>
      <div className={styles.detail}>{fold.detail}</div>
    </button>
  );
}
