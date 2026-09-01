import type { CSSProperties, JSX } from "react";
import { ClauseHead } from "./ClauseHead.tsx";
import { Sandbox } from "./Sandbox.tsx";
import styles from "./Errand.module.css";

/*
 * DECISION: the shopping is recreated as working fragments, not
 * screenshots: the little steps of an errand landing one by one, the shop
 * window with Saathi visibly at the wheel, and the choices laid out with
 * their honesty said out loud. Discoverable interaction: rest your cursor
 * on the window and Saathi yields the wheel, exactly as it does in the
 * product. The last word in the fragment belongs to the shopper, in the
 * language a shopper actually uses: bas, A le lo.
 */
const STEPS = [
  "reading your note",
  "walking three shops",
  "comparing 14 listings",
  "holding one aside",
  "asking you first",
];

type Option = {
  id: string;
  merchant: string;
  title: string;
  price: string;
  tier: "promised" | "page";
  gloss: string;
};

const OPTIONS: Option[] = [
  {
    id: "A",
    merchant: "Kolam Run",
    title: "Gc9 road shoe · UK 8",
    price: "₹3,650",
    tier: "promised",
    gloss: "the shop put this price in writing · the bill cannot quietly grow",
  },
  {
    id: "B",
    merchant: "Stride House",
    title: "Pace 2 trainer · UK 8",
    price: "₹3,890",
    tier: "page",
    gloss: "read off the live page · checked again before any money moves",
  },
  {
    id: "C",
    merchant: "OpenKicks",
    title: "Featherlight 4 · UK 8",
    price: "₹3,990",
    tier: "page",
    gloss: "found on the open web · same manners, same questions asked",
  },
];

function OptionCard({ o, i }: { o: Option; i: number }): JSX.Element {
  const promised = o.tier === "promised";
  return (
    <li className={styles.card} style={{ "--i": i } as CSSProperties} data-reveal>
      <span className={styles.cardId}>{o.id}</span>
      <span className={styles.cardMerchant}>{o.merchant}</span>
      <span className={styles.cardTitle}>{o.title}</span>
      <span className={`${styles.cardPrice} tabular`}>{o.price}</span>
      <span className={promised ? styles.tierSigned : styles.tierPage}>
        {promised ? "price promised by the shop" : "price read off the page"}
      </span>
      <span className={styles.cardGloss}>{o.gloss}</span>
    </li>
  );
}

export function Errand(): JSX.Element {
  return (
    <section className={styles.section} id="shopping" data-clause>
      <ClauseHead
        kicker="the shopping · saathi at the bazaar"
        leaf="leaf 04 · 07"
        numeral="02"
      />
      <h2 className={styles.statement} data-reveal>
        Then, the shopping.
      </h2>
      <ul className={styles.steps} aria-label="Errand steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={i === STEPS.length - 1 ? styles.stepLive : styles.step}
            style={{ "--i": i } as CSSProperties}
            data-reveal
          >
            {i < STEPS.length - 1 ? (
              <span className={styles.stepTick} aria-hidden="true">
                ✓
              </span>
            ) : (
              <span className={styles.stepPulse} aria-hidden="true" />
            )}
            {s}
          </li>
        ))}
      </ul>
      <div className={styles.grid}>
        <Sandbox />
        <div className={styles.optionsWrap} data-reveal>
          <p className={styles.sortLine}>
            in your order of value, cheapest true price first · nobody paid
            to be here
          </p>
          <ul className={styles.cards}>
            {OPTIONS.map((o, i) => (
              <OptionCard key={o.id} o={o} i={i} />
            ))}
          </ul>
          <div className={styles.chat}>
            <p className={styles.agentLine}>
              <span className={styles.agentDot} aria-hidden="true" />
              Three fit, in my order. Nobody paid to be here.
              <span className={styles.agentWho}>· saathi</span>
            </p>
            <p className={styles.userLine}>
              bas, A le lo
              <span className={styles.agentWho}>· you</span>
            </p>
            <p className={styles.agentLine}>
              <span className={styles.agentDot} aria-hidden="true" />
              Ji. Holding A at ₹3,650. Nothing is paid yet · your thumb,
              please.
              <span className={styles.agentWho}>· saathi</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
