import { useState, type JSX } from "react";
import type { Constraint } from "../api/types.ts";
import { paise } from "../primitives/formatMoney.ts";
import styles from "./RuleSentences.module.css";

type RuleSentencesProps = {
  constraints: Constraint[];
  onAmend: (key: string, next: string) => void;
  /** Removes a rule that was added but never sealed. */
  onDelete?: (key: string) => void;
};

type Sentence = { before: string; value: string; after: string };

/**
 * A rule is a sentence you said, not a row in a table. Each one renders the
 * way you would speak it, with the number you chose carrying the weight.
 * Amending edits the number in place; the sentence never leaves the page.
 */
function sentenceFor(c: Constraint): Sentence {
  const v = String(c.value);
  switch (c.key) {
    case "max_amount":
      return {
        before: "Never spend above ",
        value: paise(Number(v)),
        after: " in one purchase.",
      };
    case "curfew":
      return { before: "No purchases after ", value: v, after: "." };
    case "cooloff_threshold":
      return {
        before: "Anything above ",
        value: paise(Number(v)),
        after: " waits before it is charged.",
      };
    case "max_apr":
      return {
        before: "No credit costing more than ",
        value: `${Number(v).toFixed(1)}%`,
        after: " a year.",
      };
    case "refundable":
      return v === "true"
        ? { before: "Only buy things I can ", value: "return", after: "." }
        : { before: "Non-refundable items are ", value: "allowed", after: "." };
    case "share_aggregates":
      return v === "true"
        ? {
            before: "My shopping data ",
            value: "may",
            after: " join anonymised aggregates.",
          }
        : { before: "Never share ", value: "my shopping data", after: "." };
    case "blackout":
      return { before: "No purchases between ", value: v, after: "." };
    case "merchant_cap":
      return {
        before: "At any single merchant, never above ",
        value: paise(Number(v)),
        after: ".",
      };
    case "category_ban":
      return { before: "Never buy ", value: v, after: "." };
    default:
      return { before: `${c.label} `, value: v, after: "." };
  }
}

const BOOLEAN_KEYS = new Set(["refundable", "share_aggregates"]);

function toDraft(c: Constraint): string {
  const v = String(c.value);
  if (c.unit === "paise") return String(Number(v) / 100);
  return v;
}

/** An unreadable draft amends nothing: null means "treat as cancelled". */
function fromDraft(c: Constraint, draft: string): string | null {
  const trimmed = draft.trim();
  if (trimmed === "") return null;
  if (c.unit === "paise" || c.unit === "percent") {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) return null;
    return c.unit === "paise" ? String(Math.round(n * 100)) : String(n);
  }
  return trimmed;
}

function Editor({
  constraint,
  onDone,
}: {
  constraint: Constraint;
  onDone: (next: string | null) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(toDraft(constraint));
  const numeric = constraint.unit === "paise" || constraint.unit === "percent";

  return (
    <span className={styles.editor}>
      {constraint.unit === "paise" && <span aria-hidden="true">₹</span>}
      <input
        className={styles.input}
        type={numeric ? "number" : "text"}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onDone(fromDraft(constraint, draft));
          if (e.key === "Escape") onDone(null);
        }}
      />
      <button
        type="button"
        className={styles.save}
        onClick={() => onDone(fromDraft(constraint, draft))}
      >
        Set
      </button>
      <button
        type="button"
        className={styles.cancel}
        onClick={() => onDone(null)}
      >
        Cancel
      </button>
    </span>
  );
}

export function RuleSentences({
  constraints,
  onAmend,
  onDelete,
}: RuleSentencesProps): JSX.Element {
  const [editingKey, setEditingKey] = useState<string | null>(null);

  function handleAmendClick(c: Constraint): void {
    if (BOOLEAN_KEYS.has(c.key)) {
      onAmend(c.key, String(c.value) === "true" ? "false" : "true");
      return;
    }
    setEditingKey(c.key);
  }

  return (
    <ul className={styles.list}>
      {constraints.map((c) => {
        const s = sentenceFor(c);
        const editing = editingKey === c.key;
        return (
          <li
            key={c.key}
            className={
              c.amended ? `${styles.rule} ${styles.amended}` : styles.rule
            }
          >
            <p className={styles.sentence}>
              {s.before}
              {editing ? (
                <Editor
                  constraint={c}
                  onDone={(next) => {
                    if (next !== null && next !== String(c.value)) {
                      onAmend(c.key, next);
                    }
                    setEditingKey(null);
                  }}
                />
              ) : (
                <strong className={styles.value}>{s.value}</strong>
              )}
              {s.after}
            </p>
            {!editing && (
              <span className={styles.actions}>
                <button
                  type="button"
                  className={styles.amend}
                  onClick={() => handleAmendClick(c)}
                >
                  {c.amended ? "Amended, unsigned" : "Amend"}
                </button>
                {onDelete !== undefined && c.signedAt === "unsigned" && (
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => onDelete(c.key)}
                  >
                    Remove
                  </button>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
