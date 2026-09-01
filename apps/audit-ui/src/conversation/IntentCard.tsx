// §2.1 IntentCard — empty/draft/signed/expired. §A.2 HNP invariant surfaced
// directly: an unsigned intent says so, in plain language, on the card itself.
import { useRef, type JSX } from "react";
import { Money } from "../primitives/Money.tsx";
import { useReveal } from "../motion/useReveal.ts";
import styles from "./IntentCard.module.css";

export type IntentCardState = "empty" | "draft" | "signed" | "expired";

type IntentCardProps = {
  state: IntentCardState;
  description?: string;
  capPaise?: number;
  thumbprint?: string;
  onDraft?: () => void;
  onSign?: () => void;
  onConstraintClick?: () => void;
};

function EmptyCard({ onDraft }: { onDraft?: () => void }): JSX.Element {
  return (
    <div className={styles.card}>
      <p>No signed intent. The agent cannot propose a cart.</p>
      <button type="button" className={styles.draftButton} onClick={onDraft}>
        draft an intent
      </button>
    </div>
  );
}

/**
 * The signed state is the page's opening statement, not a status chip. It is
 * the one thing the buyer is trusting, so it gets the display face and the
 * top of the screen; the key material sits underneath it, quiet and checkable.
 */
function SignedCovenant({
  capPaise,
  thumbprint,
  onConstraintClick,
}: {
  capPaise?: number;
  thumbprint?: string;
  onConstraintClick?: () => void;
}): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref, "covenant");
  return (
    <section ref={ref} className={styles.covenant}>
      <p className={styles.eyebrow}>Your covenant</p>
      <h1 className={styles.statement}>
        {capPaise !== undefined ? (
          <>
            Nothing above <Money paise={capPaise} />.
          </>
        ) : (
          "Bounded by what you signed."
        )}
      </h1>
      <p className={styles.support}>
        The agent cannot propose a cart outside these bounds, and nothing is
        charged without your signature.
      </p>
      <p className={styles.provenance}>
        {thumbprint !== undefined && <span>{thumbprint}</span>}
        <button
          type="button"
          className={styles.amend}
          onClick={onConstraintClick}
        >
          Amend
        </button>
      </p>
    </section>
  );
}

export function IntentCard({
  state,
  description,
  capPaise,
  thumbprint,
  onDraft,
  onSign,
  onConstraintClick,
}: IntentCardProps): JSX.Element {
  if (state === "empty") return <EmptyCard onDraft={onDraft} />;
  if (state === "signed")
    return (
      <SignedCovenant
        capPaise={capPaise}
        thumbprint={thumbprint}
        onConstraintClick={onConstraintClick}
      />
    );

  const cardClass =
    state === "draft"
      ? `${styles.card} ${styles.draft}`
      : state === "expired"
        ? `${styles.card} ${styles.expired}`
        : styles.card;

  return (
    <div className={cardClass}>
      <div className={styles.header}>
        {state !== "draft" && <span className={styles.seal}>⬡</span>}
        <span>{state === "draft" ? "unsigned" : `signed`}</span>
        {thumbprint !== undefined && <span>{thumbprint}</span>}
      </div>
      {description !== undefined && <p>{description}</p>}
      {state === "draft" && (
        <p className={styles.banner}>unsigned — human confirmation forced</p>
      )}
      {capPaise !== undefined && (
        <div className={styles.chips}>
          <button
            type="button"
            className={styles.chip}
            onClick={onConstraintClick}
          >
            <Money paise={capPaise} /> cap
          </button>
        </div>
      )}
      {state === "expired" && (
        <p className={`${styles.expiry} ${styles.expiryDanger}`}>expired</p>
      )}
      {state === "draft" && (
        <button type="button" className={styles.draftButton} onClick={onSign}>
          hold to sign
        </button>
      )}
    </div>
  );
}
