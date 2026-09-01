import { useRef, type JSX } from "react";
import { TopBar } from "./chrome/TopBar.tsx";
import { Thread } from "./kolam/Thread.tsx";
import { Hero } from "./sections/Hero.tsx";
import { Problem } from "./sections/Problem.tsx";
import { Covenant } from "./sections/Covenant.tsx";
import { Errand } from "./sections/Errand.tsx";
import { Hisaab } from "./sections/Hisaab.tsx";
import { Finale } from "./sections/Finale.tsx";
import { Footer } from "./sections/Footer.tsx";
import { useRevealAll } from "./motion/useRevealAll.ts";
import { useParallaxAll } from "./motion/useParallaxAll.ts";
import styles from "./App.module.css";

/*
 * DECISION: one long page, read like a letter: the welcome at the door,
 * the worry, your word, the shopping, the hisaab, and a hand held out at
 * the end. Everything below the hero lives inside .deed so the margin
 * thread can run unbroken from the first worry to the final seal; the
 * thread is the page's spine and the reason the sections are one story
 * instead of five cards.
 */
export function App(): JSX.Element {
  useRevealAll();
  useParallaxAll();
  const deedRef = useRef<HTMLDivElement>(null);
  return (
    <div className={styles.page}>
      <TopBar />
      <main>
        <Hero />
        <div className={styles.deed} ref={deedRef}>
          <Thread hostRef={deedRef} />
          <Problem />
          <Covenant />
          <Errand />
          <Hisaab />
          <Finale />
        </div>
      </main>
      <Footer />
    </div>
  );
}
