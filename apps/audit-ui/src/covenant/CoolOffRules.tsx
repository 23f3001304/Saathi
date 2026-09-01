import type { JSX } from "react";
import type { CoolOffRule } from "../api/types.ts";
import { Field } from "../primitives/Field.tsx";
import { paise } from "../primitives/formatMoney.ts";
import styles from "./CoolOffRules.module.css";

type CooloffField = "thresholdPaise" | "durationHours";

type CoolOffRulesProps = {
  rules: CoolOffRule[];
  amended: { thresholdPaise?: string; durationHours?: string };
  onAmend: (field: CooloffField, next: string) => void;
};

/**
 * §2.2 D10 — the sentence holds still; the two numbers inside it open for
 * editing. Threshold edits arrive in rupees and are stored in paise.
 */
export function CoolOffRules({
  rules,
  amended,
  onAmend,
}: CoolOffRulesProps): JSX.Element {
  return (
    <div>
      <div className={styles.title}>Cool-off</div>
      {rules.map((rule) => (
        <p className={styles.sentence} key="cooloff">
          Anything above{" "}
          <Field
            value={String(rule.thresholdPaise / 100)}
            display={paise(rule.thresholdPaise)}
            amended={amended.thresholdPaise !== undefined}
            onCommit={(next) => {
              const n = Number(next);
              if (Number.isFinite(n) && n > 0) {
                onAmend("thresholdPaise", String(Math.round(n * 100)));
              }
            }}
          />{" "}
          waits{" "}
          <Field
            value={String(rule.durationHours)}
            display={`${rule.durationHours} hours`}
            amended={amended.durationHours !== undefined}
            onCommit={(next) => {
              const n = Number(next);
              if (Number.isFinite(n) && n > 0) {
                onAmend("durationHours", String(Math.round(n)));
              }
            }}
          />{" "}
          before it can be charged. Cancelling is instant.
        </p>
      ))}
    </div>
  );
}
