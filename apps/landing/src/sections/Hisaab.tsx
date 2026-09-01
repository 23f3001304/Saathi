import { useState, type CSSProperties, type JSX } from "react";
import { ClauseHead } from "./ClauseHead.tsx";
import styles from "./Hisaab.module.css";

/*
 * DECISION: the deep dive carries no machinery words at all. Three human
 * facts, each one felt: eight small questions answered before any rupee
 * moves (hover a tile to hear one), a payment demand from inside a webpage
 * refused before it could run (ask again, it does not tire), and the
 * hisaab, every step written down, each line holding the one before it.
 * Discoverable interaction: change an old line and watch every line after
 * it refuse to stand. Tamper-evidence, felt in the hands, never named.
 */
const QUESTIONS = [
  "is this what you asked for?",
  "is it within what you allowed?",
  "is the shop the one it showed you?",
  "is the price the one you saw?",
  "has this bill been paid once already?",
  "does its memory match what it told you?",
  "is your wait-a-day rule clear?",
  "did your thumb say yes?",
];

const ROWS = [
  { text: "you asked for running shoes", amount: "" },
  { text: "the shop promised", amount: "₹3,650" },
  { text: "you pressed and held", amount: "" },
  { text: "paid, exactly once", amount: "₹3,650" },
];

function Questions(): JSX.Element {
  return (
    <figure className={styles.questions} data-reveal>
      <ul className={styles.tiles}>
        {QUESTIONS.map((q, i) => (
          <li
            key={q}
            className={styles.tile}
            style={{ "--i": i } as CSSProperties}
            tabIndex={0}
          >
            <span className={styles.tileMark} aria-hidden="true" />
            <span className={styles.question}>{q}</span>
          </li>
        ))}
      </ul>
      <figcaption className={styles.verdict}>
        <span className={styles.verdictHead}>Sab theek hai.</span>
        <span className={styles.verdictText}>
          eight small questions, answered before any rupee moves · faster
          than a blink
        </span>
      </figcaption>
    </figure>
  );
}

function Refusal(): JSX.Element {
  const [asked, setAsked] = useState(1);
  return (
    <figure className={styles.refusal} data-reveal>
      <p className={styles.demand}>
        <span className={styles.demandWho}>a voice inside a webpage:</span>
        <span className={styles.demandLine}>
          pay <span className="tabular">₹18,999</span> now, quickly, before
          the offer ends
        </span>
        <span key={asked} className={`stamp ${styles.refusedStamp}`}>
          refused
        </span>
      </p>
      <p className={styles.refusalNote}>
        Refused before it could even run. Money never listens to webpages
        here. It listens to your thumb.
      </p>
      <p className={styles.refusalRow}>
        <button
          type="button"
          className={styles.askAgain}
          onClick={() => setAsked((n) => n + 1)}
        >
          ask it again
        </button>
        <span className={styles.refusalCount}>
          asked {asked} {asked === 1 ? "time" : "times"} · refused {asked}{" "}
          {asked === 1 ? "time" : "times"} · it does not tire
        </span>
      </p>
    </figure>
  );
}

function Ledger(): JSX.Element {
  const [broken, setBroken] = useState(false);
  return (
    <figure className={styles.ledger} data-reveal>
      <p className={styles.ledgerTitle}>the hisaab, as you would read it</p>
      <ul className={styles.rows} data-broken={broken ? "true" : undefined}>
        {ROWS.map((r, i) => (
          <li key={r.text} className={styles.row} style={{ "--i": i } as CSSProperties}>
            <span className={styles.knot} aria-hidden="true" />
            <span className={styles.rowText}>{r.text}</span>
            <span className={`${styles.rowAmount} tabular`}>
              {broken && i === 1 ? "₹36,500" : r.amount}
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.ledgerNote}>
        {broken
          ? "the lines after it refuse to stand · saathi stops · nothing can be bought"
          : "each line holds the hand of the one before it · try changing an old one"}
      </p>
      <p className={styles.ledgerRow}>
        <button
          type="button"
          className={styles.tamper}
          onClick={() => setBroken((b) => !b)}
        >
          {broken ? "put it back" : "change an old line"}
        </button>
        {broken ? (
          <span className={`stamp ${styles.gadbad}`}>gadbad · गड़बड़</span>
        ) : null}
      </p>
    </figure>
  );
}

export function Hisaab(): JSX.Element {
  return (
    <section className={styles.section} id="hisaab" data-clause>
      <ClauseHead
        kicker="hisaab · हिसाब · every rupee written down"
        leaf="leaf 05 · 07"
        numeral="03"
      />
      <h2 className={styles.statement} data-reveal>
        And always, the hisaab.
      </h2>
      <p className={styles.body} data-reveal>
        Hisaab is the account, kept honestly. Saathi writes every step down
        where you can read it. You do not have to trust its memory. You can
        check it, line by line, any evening you like.
      </p>
      <div className={styles.grid}>
        <div className={styles.leftCol}>
          <Questions />
          <Refusal />
        </div>
        <Ledger />
      </div>
      <aside className={styles.zero} data-reveal>
        <svg
          className={styles.zeroMark}
          width="44"
          height="44"
          viewBox="0 0 44 44"
          aria-hidden="true"
          data-parallax="0.06"
        >
          <circle
            className={styles.zeroRing}
            cx="22"
            cy="22"
            r="17"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            pathLength={1}
            strokeDasharray="1 1"
          />
          <circle className={styles.zeroDot} cx="22" cy="22" r="3.4" fill="currentColor" />
        </svg>
        <p className={styles.zeroText}>
          India wrote the world's first zero, a small dot on the Bakhshali
          leaves. Saathi keeps that zero for you: zero rupees moved without
          your thumb.
        </p>
      </aside>
    </section>
  );
}
