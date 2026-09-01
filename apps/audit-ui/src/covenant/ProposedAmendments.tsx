import type { JSX } from "react";
import type { PendingAmendment } from "./amendmentModel.ts";
import { widens } from "./amendmentModel.ts";
import { AmendmentChanges } from "./AmendmentChanges.tsx";
import styles from "./ProposedAmendments.module.css";

type ProposedAmendmentsProps = {
  amendments: readonly PendingAmendment[];
  onWithdraw: (id: string) => void;
};

/**
 * The amendments the agent proposed in conversation, waiting on this page.
 *
 * They are not a second list: it is the same pending set the chat is showing,
 * and it seals through the same footer as every other unsigned change here. A
 * change asked for in words and a change typed into a field are one kind of
 * thing — both inert, both waiting on the same 600 ms hold.
 */
export function ProposedAmendments({
  amendments,
  onWithdraw,
}: ProposedAmendmentsProps): JSX.Element | null {
  if (amendments.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>Asked for in conversation</h2>
        <p className={styles.note}>
          Proposed by your agent, applied by nobody. They take effect when you
          sign, like everything else here.
        </p>
      </div>
      {amendments.map((amendment) => (
        <article
          key={amendment.id}
          className={
            widens(amendment)
              ? `${styles.amendment} ${styles.loosens}`
              : styles.amendment
          }
        >
          <header className={styles.amendmentHead}>
            <h3 className={styles.summary}>{amendment.summary}</h3>
            <button
              type="button"
              className={styles.withdraw}
              onClick={() => onWithdraw(amendment.id)}
            >
              Withdraw
            </button>
          </header>
          <AmendmentChanges changes={amendment.changes} />
        </article>
      ))}
    </section>
  );
}
