import { useState, type JSX } from "react";
import { Chip } from "../primitives/Chip.tsx";
import styles from "./ScopeLists.module.css";

type ListName = "merchants" | "skus";

type ScopeListsProps = {
  merchants: string[];
  skus: string[];
  pending: { merchants: string[]; skus: string[] };
  onAdd: (list: ListName, name: string) => void;
  onRemovePending: (list: ListName, name: string) => void;
};

function ScopeRow({
  label,
  items,
  pending,
  onAdd,
  onRemovePending,
}: {
  label: string;
  items: string[];
  pending: string[];
  onAdd: (name: string) => void;
  onRemovePending: (name: string) => void;
}): JSX.Element {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function commit(): void {
    const name = draft.trim().toLowerCase().replace(/\s+/g, "-");
    if (name !== "") onAdd(name);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      {items.length === 0 ? (
        <span className={styles.unrestricted}>(unrestricted)</span>
      ) : (
        items.map((item) =>
          pending.includes(item) ? (
            <span key={item} className={styles.pendingChip}>
              <Chip variant="hatched">{item}</Chip>
              <button
                type="button"
                className={styles.removePending}
                aria-label={`Remove ${item}`}
                onClick={() => onRemovePending(item)}
              >
                ×
              </button>
            </span>
          ) : (
            <Chip key={item}>{item}</Chip>
          ),
        )
      )}
      {adding ? (
        <input
          className={styles.addInput}
          value={draft}
          autoFocus
          placeholder="name"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setAdding(false);
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.add}
          onClick={() => setAdding(true)}
        >
          + add
        </button>
      )}
    </div>
  );
}

/** §2.2 III — an empty scope list is "(unrestricted)", never a blank row.
 * Additions render hatched until sealed and can be pulled back with one ×. */
export function ScopeLists({
  merchants,
  skus,
  pending,
  onAdd,
  onRemovePending,
}: ScopeListsProps): JSX.Element {
  return (
    <section className={styles.section}>
      <div className={styles.title}>Where I may shop</div>
      <ScopeRow
        label="Merchants"
        items={merchants}
        pending={pending.merchants}
        onAdd={(name) => onAdd("merchants", name)}
        onRemovePending={(name) => onRemovePending("merchants", name)}
      />
      <ScopeRow
        label="Products"
        items={skus}
        pending={pending.skus}
        onAdd={(name) => onAdd("skus", name)}
        onRemovePending={(name) => onRemovePending("skus", name)}
      />
    </section>
  );
}
