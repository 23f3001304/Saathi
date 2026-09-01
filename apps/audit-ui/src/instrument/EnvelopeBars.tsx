import type { JSX } from "react";
import type { Envelope } from "../api/types.ts";
import { Meter } from "../primitives/Meter.tsx";
import { Money } from "../primitives/Money.tsx";
import styles from "./EnvelopeBars.module.css";

type EnvelopeBarsProps = {
  envelopes: Envelope[];
  onSelect?: (category: string) => void;
};

/** §2.1 — solid = captured, hatched = committed-not-captured (cool-off holds). */
export function EnvelopeBars({
  envelopes,
  onSelect,
}: EnvelopeBarsProps): JSX.Element {
  return (
    <div className={styles.bars}>
      {envelopes.map((envelope) => {
        const left =
          envelope.capPaise - envelope.capturedPaise - envelope.committedPaise;
        return (
          <button
            type="button"
            key={envelope.category}
            className={styles.row}
            onClick={() => onSelect?.(envelope.category)}
          >
            <span className={styles.category}>{envelope.category}</span>
            <Meter
              segments={[
                {
                  fraction: envelope.capturedPaise / envelope.capPaise,
                  style: "solid-indigo",
                  label: "captured",
                },
                {
                  fraction: envelope.committedPaise / envelope.capPaise,
                  style: "hatched-indigo",
                  label: "held",
                },
              ]}
            />
            <span className={styles.left}>
              <Money paise={Math.max(0, left)} /> left
            </span>
          </button>
        );
      })}
    </div>
  );
}
