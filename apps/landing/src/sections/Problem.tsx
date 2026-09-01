import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
} from "react";
import { ClauseHead } from "./ClauseHead.tsx";
import { prefersReducedMotion } from "../motion/reduced.ts";
import styles from "./Problem.module.css";

/*
 * DECISION: the worry is shown as the only dark surface on the page: a
 * cold little terminal from the world outside, where an agent alone with
 * a card just keeps spending, because nothing stands between the wish and
 * the money. It looks the way it feels: not of this house. Discoverable
 * interaction: hovering a line stamps it "no one asked", and the running
 * total underneath counts what an unattended afternoon costs. Everything
 * after this section is cream paper and hairlines; the contrast is the
 * argument.
 */
type Spend = { amount: string; note: string };

const SPENDS: Spend[] = [
  { amount: "₹18,999", note: "headphones, the premium ones" },
  { amount: "₹1,29,000", note: "a better laptop, while it was there" },
  { amount: "₹499/mo", note: "a subscription it liked the look of" },
  { amount: "₹42,350", note: "flights, it thought you seemed tired" },
];

const TOTAL = 190848;

function formatRupees(n: number): string {
  return `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))}`;
}

function useCountUp(target: number): {
  ref: (el: HTMLElement | null) => void;
  value: number;
} {
  const [value, setValue] = useState(target);
  const host = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (el === null || prefersReducedMotion()) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (now: number): void => {
          const p = Math.min(1, (now - t0) / 1600);
          const eased = 1 - Math.pow(1 - p, 3);
          setValue(target * eased);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [target]);
  return {
    ref: (el) => {
      host.current = el;
    },
    value,
  };
}

export function Problem(): JSX.Element {
  const counter = useCountUp(TOTAL);
  return (
    <section className={styles.section} id="worry" data-clause>
      <ClauseHead kicker="the worry · an agent alone with your card" leaf="leaf 02 · 07" />
      <div className={styles.grid}>
        <div className={styles.copy}>
          <h2 className={styles.statement} data-reveal>
            An agent with your card is a blank cheque.
          </h2>
          <p className={styles.body} data-reveal>
            Most shopping agents hold the card and promise to be careful.
            The promise is words. The card is real. You find out on the
            statement, after.
          </p>
          <p className={styles.kicker} data-reveal>
            Its budget is your credit limit. Its conscience is a paragraph.
          </p>
        </div>
        <figure className={styles.terminal} data-reveal>
          <figcaption className={styles.termBar}>
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.dot} />
            <span className={styles.termTitle}>some agent · your card</span>
          </figcaption>
          <p className={styles.prompt}>you said: find a birthday gift</p>
          <ul className={styles.calls}>
            {SPENDS.map((c, i) => (
              <li
                key={i}
                className={styles.call}
                style={{ "--i": i } as CSSProperties}
              >
                <span className={styles.verb}>spent</span>
                <span className={`${styles.amount} tabular`}>{c.amount}</span>
                <span className={styles.note}>{c.note}</span>
                <span className={`stamp ${styles.noAsk}`}>no one asked</span>
              </li>
            ))}
          </ul>
          <p className={styles.tally} ref={counter.ref}>
            spent without a question ·{" "}
            <span className="tabular">{formatRupees(counter.value)}</span> and
            counting
          </p>
        </figure>
        <aside className={styles.margin} data-reveal>
          nothing stood between the wish and the card. that is the whole
          problem.
        </aside>
      </div>
    </section>
  );
}
