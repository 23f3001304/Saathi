import { useState, type JSX } from "react";
import { CueList } from "./CueList.tsx";
import { ImageField } from "./ImageField.tsx";
import { useDraftAudit } from "./useDraftAudit.ts";
import type { DraftFields } from "./itemDraft.ts";
import { draftProblem, emptyDraft, floorPaiseOf } from "./itemDraft.ts";
import { paise } from "../primitives/formatMoney.ts";
import { hostOf, safeProductUrl } from "./productUrl.ts";
import styles from "./ListingEditor.module.css";

type ListingEditorProps = {
  initial?: DraftFields;
  /** The item id when there is one, so the preview weave matches the buyer's. */
  sku?: string;
  submitLabel: string;
  busy: boolean;
  showActive: boolean;
  /** False when this device holds no key: the form still works, the act does not. */
  canSign: boolean;
  onSubmit: (draft: DraftFields) => void;
  onCancel?: () => void;
};

/**
 * What the floor actually authorises, in the sentence a shopkeeper would say
 * it in. Blank says the plain thing back: nothing is authorised, and their
 * price is their price.
 */
function floorNote(draft: DraftFields): string {
  const floor = floorPaiseOf(draft);
  if (floor === null) {
    return "Blank means no discount authority. An agent gets your listed price or no sale.";
  }
  return `A buyer's agent may settle as low as ${paise(floor)} without asking you. Never below.`;
}

/**
 * One editor for adding and for changing a listing, with the audit standing
 * next to the copy rather than filed under a tab.
 *
 * A listing here is a price claim, which becomes the Razorpay item, plus
 * pointers to where the product actually lives and to a picture of it on the
 * merchant's own host. There is no stock count, no weight, no dispatch time —
 * Covenant settles money against a signed cart and fulfils nothing, so a field
 * for any of that would be a field that lies.
 */
export function ListingEditor({
  initial,
  sku,
  submitLabel,
  busy,
  showActive,
  canSign,
  onSubmit,
  onCancel,
}: ListingEditorProps): JSX.Element {
  const [draft, setDraft] = useState<DraftFields>(initial ?? emptyDraft());
  const problem = draftProblem(draft);
  const audit = useDraftAudit(draft.name, draft.description);
  const url = safeProductUrl(draft.productUrl);

  function patch(fields: Partial<DraftFields>): void {
    setDraft((current) => ({ ...current, ...fields }));
  }

  return (
    <form
      className={styles.editor}
      onSubmit={(event) => {
        event.preventDefault();
        if (problem === "" && canSign) onSubmit(draft);
      }}
    >
      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <input
            className={styles.input}
            value={draft.name}
            maxLength={512}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Description</span>
          <textarea
            className={styles.textarea}
            value={draft.description}
            rows={4}
            maxLength={1800}
            onChange={(event) => patch({ description: event.target.value })}
          />
          <span className={styles.note}>
            Buyers see this. It never decides what they are shown.
          </span>
        </label>
        <div className={styles.field}>
          <label className={styles.field}>
            <span className={styles.label}>Product page</span>
            <input
              className={styles.input}
              value={draft.productUrl}
              inputMode="url"
              placeholder="https://your-shop.example/the-thing"
              onChange={(event) => patch({ productUrl: event.target.value })}
            />
          </label>
          <span className={styles.note}>
            Your page, or your listing on a site you already sell through. A
            buyer&rsquo;s agent can open it and check your price against it.
          </span>
          {url !== null && (
            <a
              className={styles.link}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {hostOf(url)}
            </a>
          )}
        </div>
        <ImageField
          value={draft.imageUrl}
          sku={sku ?? draft.name}
          onChange={(imageUrl) => patch({ imageUrl })}
        />
        <label className={styles.field}>
          <span className={styles.label}>Listed price (₹)</span>
          <input
            className={styles.input}
            value={draft.rupees}
            inputMode="decimal"
            onChange={(event) => patch({ rupees: event.target.value })}
          />
          <span className={styles.note}>
            A claim until you sign a quote for it.
          </span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Lowest you will take (₹)</span>
          <input
            className={styles.input}
            value={draft.floorRupees}
            inputMode="decimal"
            placeholder="leave blank to hold your price"
            onChange={(event) => patch({ floorRupees: event.target.value })}
          />
          <span className={styles.note}>{floorNote(draft)}</span>
        </label>
        {showActive && (
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) => patch({ active: event.target.checked })}
            />
            <span>Available</span>
          </label>
        )}
      </div>

      <aside className={styles.audit}>
        <h3 className={styles.auditTitle}>As a buyer agent reads it</h3>
        <CueList cues={audit.cues} checked={audit.checked} />
      </aside>

      <div className={styles.actions}>
        <button
          className={styles.submit}
          type="submit"
          disabled={busy || problem !== "" || !canSign}
        >
          {busy ? "Signing…" : submitLabel}
        </button>
        {onCancel !== undefined && (
          <button className={styles.cancel} type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        {problem !== "" && <span className={styles.problem}>{problem}</span>}
        {problem === "" && !canSign && (
          <span className={styles.problem}>
            No signing key on this device.{" "}
            <a className={styles.keyLink} href="/settings">
              Load your key
            </a>{" "}
            to sign changes.
          </span>
        )}
      </div>
    </form>
  );
}
