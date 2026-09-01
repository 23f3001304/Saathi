import { useState, type JSX } from "react";
import type { Constraint } from "../api/types.ts";

type Unit = NonNullable<Constraint["unit"]>;
import styles from "./AddRule.module.css";

type AddRuleProps = {
  onAdd: (rule: Constraint) => void;
  taken: Set<string>;
};

type Template = {
  key: string;
  menuLabel: string;
  label: string;
  unit: Unit;
  defaultValue: string;
};

/**
 * Only rules the gateway can actually enforce are offered. A free-text rule
 * would be a wish, and this page does not deal in wishes.
 *
 * Two templates were removed once sealing became real: "Cap one merchant" and
 * "Ban a category" have no §6.2 bound to become, so they could be typed, shown
 * and held-to-sign and never reach the ledger. They were wishes wearing a
 * rule's clothes, which is worse than an absent feature — the page said it did
 * not deal in wishes while offering two.
 */
const TEMPLATES: Template[] = [
  {
    key: "blackout_hours",
    menuLabel: "Quiet hours",
    label: "No purchases between",
    unit: "window",
    defaultValue: "23:00-06:00",
  },
];

export function AddRule({ onAdd, taken }: AddRuleProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const available = TEMPLATES.filter((t) => !taken.has(t.key));

  if (available.length === 0) return <></>;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        + Add a rule
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {available.map((t) => (
            <button
              key={t.key}
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                onAdd({
                  key: t.key,
                  label: t.label,
                  value: t.defaultValue,
                  unit: t.unit,
                  signedAt: "unsigned",
                  amended: true,
                });
                setOpen(false);
              }}
            >
              {t.menuLabel}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
