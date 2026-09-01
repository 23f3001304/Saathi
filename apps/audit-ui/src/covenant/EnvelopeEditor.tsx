import type { JSX } from "react";
import type { Envelope } from "../api/types.ts";
import { Meter } from "../primitives/Meter.tsx";
import { Money } from "../primitives/Money.tsx";
import { Field } from "../primitives/Field.tsx";
import { paise } from "../primitives/formatMoney.ts";
import styles from "./EnvelopeEditor.module.css";

type EnvelopeEditorProps = {
  envelopes: Envelope[];
  onAmendCap: (category: string, nextCapPaise: string) => void;
};

/** §2.2 II — the held (cool-off) portion is always hatched, never solid. */
export function EnvelopeEditor({
  envelopes,
  onAmendCap,
}: EnvelopeEditorProps): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.title}>Monthly budgets</div>
      {envelopes.map((envelope) => (
        <div className={styles.row} key={envelope.category}>
          <span>{envelope.category}</span>
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
          <span className={styles.figures}>
            <Money paise={envelope.capturedPaise} /> /{" "}
            <Field
              value={String(envelope.capPaise)}
              display={paise(envelope.capPaise)}
              amended={false}
              onCommit={(next) => onAmendCap(envelope.category, next)}
            />
          </span>
        </div>
      ))}
    </section>
  );
}
