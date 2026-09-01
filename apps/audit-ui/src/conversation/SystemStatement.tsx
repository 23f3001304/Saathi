import type { JSX } from "react";
import { Glyph } from "../primitives/Glyph.tsx";
import styles from "./SystemStatement.module.css";

type SystemStatementProps = {
  text: string;
};

/** §3.2 frame 5 — the agent's graceful message, shield glyph, arrives whole. */
export function SystemStatement({ text }: SystemStatementProps): JSX.Element {
  return (
    <div className={styles.statement}>
      <span className={styles.glyph}>
        <Glyph name="shield" />
      </span>
      <p className={styles.text}>{text}</p>
    </div>
  );
}
