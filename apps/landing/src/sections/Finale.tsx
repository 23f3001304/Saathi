import { useState, type JSX } from "react";
import { Seal } from "../kolam/Seal.tsx";
import { BUILD_URL, DEMO_URL } from "../content/links.ts";
import styles from "./Finale.module.css";

/*
 * DECISION: the close is a quiet ceremony, not a repeat of the hero. One
 * oversized seal, centred like a rangoli at the end of the courtyard, and
 * the two real doors out. Discoverable interaction: hold the seal and the
 * page itself is witnessed, stamped with today's date; the reader leaves
 * having performed the product's whole promise once with their own hand.
 */
function today(): string {
  return new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function Finale(): JSX.Element {
  const [witnessed, setWitnessed] = useState<string | null>(null);
  return (
    <section className={styles.section} id="witness" data-clause>
      <h2 className={styles.statement} data-reveal>
        Ready when you are.
      </h2>
      <p className={styles.body} data-reveal>
        Watch Saathi run a real errand, or come and see how the house is
        built. Either way, you have already learnt the important part: the
        press, the hold, the last word that stays yours.
      </p>
      <div className={styles.sealWrap} data-reveal>
        <Seal
          size={132}
          label="press and hold"
          doneLabel="witnessed by your hand"
          onComplete={() => setWitnessed(today())}
        />
        {/* "aaj" until a real hold lands a real date: the placeholder is
            stable across prerender and hydration, and never visible. */}
        <span
          className={`stamp ${styles.witnessStamp}`}
          data-shown={witnessed !== null ? "true" : undefined}
          aria-hidden={witnessed === null}
        >
          witnessed · {witnessed ?? "aaj"}
        </span>
      </div>
      <p className={styles.ctaRow} data-reveal>
        <a className={styles.ctaPrimary} href={DEMO_URL}>
          watch the demo
        </a>
        <a className={styles.ctaQuiet} href={BUILD_URL}>
          see how it is built
        </a>
      </p>
      <p className={styles.meta} data-reveal>
        a five-minute walk-through · built for the Razorpay AI Buildathon
      </p>
    </section>
  );
}
