// §2.3 — the raw hash-chained stream, newest-top, auto-follow with
// pause-on-scroll (a presenter scrolling to read history shouldn't get yanked).
import {
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import type { LedgerFrame } from "../ledger/types.ts";
import { Hash } from "../primitives/Hash.tsx";
import { Timestamp } from "../primitives/Timestamp.tsx";
import styles from "./EventStream.module.css";

type EventStreamProps = {
  frames: LedgerFrame[];
  onSelectTxn?: (txnId: string) => void;
};

function statusGlyph(frame: LedgerFrame): { glyph: string; cls: string } {
  if (
    frame.kind === "memory.write.rejected" ||
    frame.kind === "payment.failed" ||
    frame.kind === "attack.detected"
  ) {
    return { glyph: "✗", cls: styles.fail };
  }
  if (frame.kind === "verdict.emitted" || frame.kind === "payment.captured")
    return { glyph: "✓", cls: styles.pass };
  return { glyph: "–", cls: "" };
}

export function EventStream({
  frames,
  onSelectTxn,
}: EventStreamProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const newestFirst = [...frames].reverse();

  useEffect(() => {
    if (autoFollow && containerRef.current !== null)
      containerRef.current.scrollTop = 0;
  }, [frames.length, autoFollow]);

  function handleScroll(e: UIEvent<HTMLDivElement>): void {
    setAutoFollow(e.currentTarget.scrollTop < 8);
  }

  function selectRow(frame: LedgerFrame): void {
    if (frame.txn_id !== null) onSelectTxn?.(frame.txn_id);
  }

  function handleRowKeyDown(
    e: KeyboardEvent<HTMLDivElement>,
    frame: LedgerFrame,
  ): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectRow(frame);
    }
  }

  return (
    <div
      className={styles.stream}
      ref={containerRef}
      onScroll={handleScroll}
      role="table"
      aria-label="Raw event stream"
    >
      {newestFirst.map((frame) => {
        const { glyph, cls } = statusGlyph(frame);
        return (
          // Hash below is its own (copy) button; a row can't be a <button> too.
          <div
            key={frame.id}
            className={styles.row}
            role="button"
            tabIndex={0}
            onClick={() => selectRow(frame)}
            onKeyDown={(e) => handleRowKeyDown(e, frame)}
          >
            <span>{frame.id}</span>
            <Timestamp iso={frame.ts} />
            <span className={styles.actor}>{frame.actor}</span>
            <span>{frame.kind}</span>
            <span>{frame.txn_id?.slice(-4) ?? "–"}</span>
            <span className={cls}>{glyph}</span>
            <Hash value={frame.this_hash} />
          </div>
        );
      })}
    </div>
  );
}
