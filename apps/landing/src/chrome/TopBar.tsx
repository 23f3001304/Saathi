import { useEffect, useState, type JSX } from "react";
import { SaathiMark } from "./SaathiMark.tsx";
import { DEMO_URL } from "../content/links.ts";
import styles from "./TopBar.module.css";

/*
 * DECISION: the bar starts as bare type on the paper and only takes a
 * surface and a hairline once the reader is past the threshold, so the
 * hero owns its first viewport whole. The links speak the page's own
 * plain words, not "Features/Pricing": the worry, your word, the
 * shopping, the hisaab.
 */
const CLAUSES: Array<{ href: string; text: string }> = [
  { href: "#worry", text: "the worry" },
  { href: "#promise", text: "your word" },
  { href: "#shopping", text: "the shopping" },
  { href: "#hisaab", text: "hisaab" },
];

function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const read = (): void => {
      raf = 0;
      setScrolled(window.scrollY > 14);
    };
    const onScroll = (): void => {
      if (raf === 0) raf = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    read();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);
  return scrolled;
}

export function TopBar(): JSX.Element {
  const scrolled = useScrolled();
  return (
    <header
      className={styles.bar}
      data-scrolled={scrolled ? "true" : undefined}
    >
      <a className={styles.brand} href="#top">
        <SaathiMark size={22} />
        <span className={styles.name}>Saathi</span>
      </a>
      <nav className={styles.nav} aria-label="Sections">
        {CLAUSES.map((c) => (
          <a key={c.href} className={styles.link} href={c.href}>
            {c.text}
          </a>
        ))}
        <a className={styles.cta} href={DEMO_URL}>
          watch the demo
        </a>
      </nav>
    </header>
  );
}
