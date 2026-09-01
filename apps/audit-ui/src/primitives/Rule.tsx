import type { JSX } from "react";
import styles from "./Rule.module.css";

type RuleProps = {
  strong?: boolean;
};

/** R6/§6.3 — depth comes from hairlines, never a shadow (R2 reserves that). */
export function Rule({ strong = false }: RuleProps): JSX.Element {
  return (
    <hr className={strong ? `${styles.rule} ${styles.strong}` : styles.rule} />
  );
}
