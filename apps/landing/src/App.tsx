import type { JSX } from "react";
import { TopBar } from "./chrome/TopBar.tsx";
import { Story } from "./sections/Story.tsx";
import { Footer } from "./sections/Footer.tsx";
import { useInView } from "./motion/useInView.ts";
import styles from "./App.module.css";

/*
 * DECISION: the page is a kathputli show. A string puppet is the one image
 * that says the whole product: every agent dances for someone, and this
 * one's strings are in the shopper's hand. Six scenes tell the household
 * tale (the worry, the word, the bazaar, the tricks, the hisaab, the
 * thumb); the puppet walks them as the reader scrolls; the photographs
 * hang like painted backdrops. One IntersectionObserver runs the whole
 * choreography: no scroll listeners, no rAF loops, no ResizeObservers.
 */
export function App(): JSX.Element {
  useInView();
  return (
    <div className={styles.page}>
      <TopBar />
      <main>
        <Story />
      </main>
      <Footer />
    </div>
  );
}
