import type { CSSProperties, JSX } from "react";
import { Seal } from "../kolam/Seal.tsx";
import styles from "./HeroStack.module.css";

/*
 * DECISION: the hero carries an object with mass, not a caption. Every
 * strong reference page puts the product itself in viewport one: a card,
 * a screen, something layered and tangible. Ours is three: the window
 * Saathi shops through (behind, mid-errand), the bill it ends at (front,
 * with a real hold-to-sign seal that actually fills under the thumb: the
 * discoverable interaction of the whole page), and the refusal stamped
 * across the corner, because the refusal is the product's thesis. All
 * hand-built DOM in the landing's own type: nothing screenshotted,
 * nothing that can rot.
 */

const PILLS = ["reading your note", "walking three shops", "holding one aside"];

function BrowserCard(): JSX.Element {
  return (
    <div
      className={`${styles.card} ${styles.browser}`}
      data-reveal
      style={{ "--i": 0 } as CSSProperties}
    >
      <p className={styles.chrome}>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.url}>shop.example/kurtas</span>
        <span className={styles.live}>· live</span>
      </p>
      <p className={styles.pillRow}>
        {PILLS.map((pill) => (
          <span key={pill} className={styles.pill}>
            {pill}
          </span>
        ))}
      </p>
      <div className={styles.shelf} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p className={styles.watchNote}>you can watch every page it visits</p>
    </div>
  );
}

function BillCard(): JSX.Element {
  return (
    <div
      className={`${styles.card} ${styles.bill}`}
      data-reveal
      style={{ "--i": 1 } as CSSProperties}
    >
      <p className={styles.billTag}>your bill</p>
      <p className={styles.billLine}>
        <span>Navy cotton kurta, M</span>
        <span className={styles.money}>₹1,299</span>
      </p>
      <p className={styles.billLine}>
        <span>your ceiling</span>
        <span className={styles.money}>₹2,000</span>
      </p>
      <p className={styles.underCap}>₹701 under what you signed</p>
      <div className={styles.sealRow}>
        <Seal size={64} label="hold to sign" doneLabel="signed" />
        <span className={styles.sealHint}>
          nothing is bought without this
        </span>
      </div>
    </div>
  );
}

export function HeroStack(): JSX.Element {
  return (
    <div className={styles.stack}>
      <BrowserCard />
      <BillCard />
      <p
        className={styles.refused}
        data-reveal
        style={{ "--i": 2 } as CSSProperties}
      >
        execute_payment · refused before it ran
      </p>
    </div>
  );
}
