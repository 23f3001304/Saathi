import type { JSX, ReactNode } from "react";
import styles from "./Panel.module.css";

type PanelProps = {
  title?: string;
  sunk?: boolean;
  children: ReactNode;
};

export function Panel({
  title,
  sunk = false,
  children,
}: PanelProps): JSX.Element {
  const classes = sunk ? `${styles.panel} ${styles.sunk}` : styles.panel;
  return (
    <section className={classes}>
      {title !== undefined && <h2 className={styles.title}>{title}</h2>}
      {children}
    </section>
  );
}
