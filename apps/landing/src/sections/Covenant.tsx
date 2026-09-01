import { useState, type CSSProperties, type JSX } from "react";
import { ClauseHead } from "./ClauseHead.tsx";
import { Seal } from "../kolam/Seal.tsx";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import styles from "./Covenant.module.css";

/*
 * DECISION: your word is shown as what it is in this house: a short note
 * to a trusted companion, ruled like good stationery, standing under the
 * toran arch the way a doorway stands under its tiles. Two discoveries:
 * turning a line over shows what it means once Saathi is at the shop, and
 * the seal at the foot is the product's real 600ms press-and-hold. The
 * page does not tell you the gesture feels definitive; it lets your thumb
 * find out. No spec words anywhere: a person writes a note, a companion
 * keeps it.
 */
type Line = { term: string; value: string; meaning: string };

const LINES: Line[] = [
  {
    term: "what to find",
    value: "running shoes · UK 8",
    meaning: "a laptop is not a running shoe · it will not pretend otherwise",
  },
  {
    term: "up to",
    value: "₹4,000 · bas",
    meaning: "for it, the 4,001st rupee simply does not exist",
  },
  {
    term: "ask me first",
    value: "above ₹1,500",
    meaning: "a question before, never an apology after",
  },
  {
    term: "monthly charges",
    value: "kabhi nahi",
    meaning: "it cannot start what you never allowed",
  },
];

function NoteRow({
  line,
  index,
  kept,
}: {
  line: Line;
  index: number;
  kept: boolean;
}): JSX.Element {
  return (
    <li
      className={styles.limit}
      data-signed={kept ? "true" : undefined}
      style={{ "--i": index } as CSSProperties}
    >
      <span className={styles.tick} aria-hidden="true">
        ✓
      </span>
      <span className={styles.term}>{line.term}</span>
      <span className={`${styles.value} tabular`}>{line.value}</span>
      <span className={styles.refusal}>{line.meaning}</span>
    </li>
  );
}

export function Covenant(): JSX.Element {
  const [kept, setKept] = useState(false);
  return (
    <section className={styles.section} id="promise" data-clause>
      <ClauseHead
        kicker="your word · वचन"
        leaf="leaf 03 · 07"
        numeral="01"
      />
      <div className={styles.grid}>
        <div className={styles.copy}>
          <h2 className={styles.statement} data-reveal>
            First, your word.
          </h2>
          <p className={styles.body} data-reveal>
            Before Saathi goes anywhere near a shop, you write it a short
            note: what to find, up to how much, when to stop and ask you.
            Saathi cannot cross that note. Not because it promises to be
            good, but because the door past your word is locked from your
            side. Turn a line over to see what it means at the shop.
          </p>
          <p className={styles.beats} data-reveal>
            you say it once · Saathi shops inside it · every bill ends at
            your thumb
          </p>
        </div>
        <figure className={styles.deedWrap} data-reveal>
          <div className={styles.deed} data-signed={kept ? "true" : undefined}>
            <span className={styles.arch}>
              <SaathiMark size={36} />
            </span>
            <p className={styles.deedTitle}>your note to saathi</p>
            <ul className={styles.limits}>
              {LINES.map((l, i) => (
                <NoteRow key={l.term} line={l} index={i} kept={kept} />
              ))}
            </ul>
            <div className={styles.sealRow}>
              <Seal
                size={84}
                label="press and hold"
                doneLabel="given by hand"
                onComplete={() => setKept(true)}
              />
              <span className={`stamp ${styles.inForce}`}>pakka</span>
            </div>
          </div>
          <figcaption className={styles.deedNote}>
            {kept
              ? "Pakka. It cannot be talked out of your word. Not by a clever page, not by itself."
              : "the same press and hold approves every bill · six hundred milliseconds, under your thumb"}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
