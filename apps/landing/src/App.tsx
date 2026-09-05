import type { JSX } from "react";
import { Wordmark } from "./chrome/Wordmark.tsx";
import { Footer } from "./sections/Footer.tsx";
import { BUILD_URL, DEMO_URL } from "./content/links.ts";
import { useInView } from "./motion/useInView.ts";
import styles from "./App.module.css";

/*
 * HOLDING STATE (2026-09-04): all landing drafts deleted at the founder's
 * request, for the second time. The page holds the door only: wordmark,
 * promise, two links, footer. The founder-KEEP components remain intact
 * and waiting (Wordmark, Seal + useHold, tokens, useInView, the no-JS
 * prerender bake). Read docs/landing-handover.md before building here.
 */
export function App(): JSX.Element {
  useInView();
  return (
    <div className={styles.page}>
      <main className={styles.holding}>
        <h1 className={styles.name} data-s>
          <Wordmark mode="hero" />
        </h1>
        <p className={styles.promise} data-s style={{ "--i": 1 } as never}>
          A shopping companion that asks first, shows every step, and buys
          nothing until you press and hold.
        </p>
        <p className={styles.doors} data-s style={{ "--i": 2 } as never}>
          <a href={DEMO_URL}>watch the demo</a>
          <a href={BUILD_URL}>see how it is built</a>
        </p>
      </main>
      <Footer />
    </div>
  );
}
