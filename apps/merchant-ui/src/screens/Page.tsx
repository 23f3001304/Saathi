import type { JSX, ReactNode } from "react";
import styles from "./Page.module.css";

type PageProps = {
  title: string;
  /** One sentence. Not two. */
  lede?: string;
  /** Whether the figures on THIS page came off a real gateway. */
  live: boolean;
  /** Where they came from, in a few words. */
  source: string;
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * Every page wears its own provenance. Not the app's — the page's: the shelf
 * can be a fixture while the trust fold is live, and one badge in the corner
 * would have to lie about one of them.
 */
export function Page({
  title,
  lede,
  live,
  source,
  actions,
  children,
}: PageProps): JSX.Element {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <span className={live ? styles.live : styles.fixture}>
          {live ? "LIVE" : "SAMPLE"}
        </span>
        <span className={styles.source}>{source}</span>
        <span className={styles.spacer} />
        {actions}
      </header>
      {lede !== undefined && <p className={styles.lede}>{lede}</p>}
      {children}
    </main>
  );
}
