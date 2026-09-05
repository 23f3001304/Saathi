import type { JSX } from "react";
import { Wordmark } from "../chrome/Wordmark.tsx";
import { SaathiMark } from "../chrome/SaathiMark.tsx";
import { BUILD_URL, DEMO_URL } from "../content/links.ts";
import styles from "./Footer.module.css";

/*
 * DECISION: the footer is the other doorpost. The name returns at hero
 * scale to bookend the page, and its discoverable interaction is the
 * reverse of the hero's arrival: rest a cursor on it and the pigments
 * come back letter by letter, lift it and the ink dries again. Navigation
 * sits inside the composition like a bazaar signboard's small print, and
 * the last line of the page is the promise, said once more in eight
 * words.
 */
const INDEX = [
  { href: "#window", text: "the window" },
  { href: "#refusals", text: "refusals" },
  { href: "#hisaab", text: "the hisaab" },
  { href: "#top", text: "back to the top" },
];

const DOORS = [
  { href: DEMO_URL, text: "watch the demo" },
  { href: BUILD_URL, text: "see how it is built" },
  { href: "https://razorpay.com", text: "razorpay ai buildathon" },
];

export function Footer(): JSX.Element {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <p className={styles.mark} aria-hidden="true" data-s>
          <SaathiMark size={34} />
        </p>
        <p className={styles.wordmarkRow}>
          <Wordmark mode="footer" className={styles.wordmark} />
        </p>
        <p className={styles.hindi}>
          <span className={styles.hindiWord}>साथी</span> means companion.
          Saathi asks before it spends, shows every step, and buys nothing
          until you press and hold. That is the whole trick. There is no
          other trick.
        </p>
        <div className={styles.columns}>
          <nav className={styles.col} aria-label="Page index">
            <p className={styles.colHead}>the page</p>
            {INDEX.map((l) => (
              <a key={l.href} className={styles.link} href={l.href}>
                {l.text}
              </a>
            ))}
          </nav>
          <nav className={styles.col} aria-label="Doors">
            <p className={styles.colHead}>the doors</p>
            {DOORS.map((l) => (
              <a key={l.text} className={styles.link} href={l.href}>
                {l.text}
              </a>
            ))}
          </nav>
          <p className={styles.colWide}>
            Built in 48 hours for the Razorpay AI Buildathon, on cream
            paper, in Indian ink, with five pigments and one unbroken line.
          </p>
        </div>
        <p className={styles.utility}>
          <span>© 2026 saathi</span>
          <span>made in India</span>
          <span>no dark patterns · they are refused at the door</span>
        </p>
      </div>
    </footer>
  );
}
