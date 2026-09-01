// §2.0/§3.2 frame 6 — R3 exception: this IS a pill, and it's an action
// (click scrolls to the attack lane). Flashes crimson-12 on arrival.
import { useEffect, useRef, useState, type JSX } from "react";
import { useLedgerSelector } from "../ledger/useLedger.ts";
import { alarmingCount } from "../ledger/attackLane.ts";
import styles from "./RangeChip.module.css";

const FLASH_MS = 300;

type RangeChipProps = { onClick?: () => void };

/** The write gate, in one mark. */
function Shield(): JSX.Element {
  return (
    <svg viewBox="0 0 12 13" className={styles.shield} aria-hidden="true">
      <path
        d="M6 1 10.5 2.6v4.1c0 2.6-1.8 4.4-4.5 5.3C3.3 11.1 1.5 9.3 1.5 6.7V2.6L6 1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RangeChip({ onClick }: RangeChipProps): JSX.Element {
  const count = useLedgerSelector((s) => s.rangeBlockedCount);
  // A refusal is not an attack. Thirty-three tier refusals shown as "33
  // blocked" over a crimson chip reads as thirty-three attempts on the
  // covenant, when it is the write gate doing its ordinary work.
  const alarming = useLedgerSelector((s) => alarmingCount(s.attackEvents));
  const [flashing, setFlashing] = useState(false);
  const prevCount = useRef(count);

  useEffect(() => {
    if (count > prevCount.current) {
      setFlashing(true);
      const id = setTimeout(() => setFlashing(false), FLASH_MS);
      prevCount.current = count;
      return () => clearTimeout(id);
    }
    prevCount.current = count;
    return undefined;
  }, [count]);

  const classes = [
    styles.chip,
    alarming > 0 ? styles.blocked : "",
    flashing ? styles.flash : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      aria-live="assertive"
      title={
        alarming > 0
          ? "Attempts to loosen your rules, all refused. Open the list."
          : "Facts the agent tried to remember and could not. Open the list."
      }
    >
      <Shield />
      {alarming > 0 ? `${alarming} blocked` : `${count} refused`}
    </button>
  );
}
