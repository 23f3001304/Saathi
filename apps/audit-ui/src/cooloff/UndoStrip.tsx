import { useEffect, type JSX } from "react";
import { Money } from "../primitives/Money.tsx";
import styles from "./UndoStrip.module.css";

const VISIBLE_MS = 5000;

type UndoStripProps = {
  amountPaise: number;
  category: string;
  onUndo: () => void;
  onExpire: () => void;
};

/** §2.4 D11 — the safety mechanism for a no-confirm cancel: 5s to undo. */
export function UndoStrip({
  amountPaise,
  category,
  onUndo,
  onExpire,
}: UndoStripProps): JSX.Element {
  useEffect(() => {
    const id = setTimeout(onExpire, VISIBLE_MS);
    return () => clearTimeout(id);
  }, [onExpire]);

  return (
    <div className={styles.strip} role="status">
      <span>
        Cancelled. <Money paise={amountPaise} /> returned to {category}.
      </span>
      <button type="button" className={styles.undo} onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
