import type { JSX } from "react";
import { SystemStatement } from "./SystemStatement.tsx";
import styles from "./Message.module.css";

type MessageProps = {
  text: string;
  from: "agent";
  ts?: string;
  streaming?: boolean;
  variant?: "system";
};

/** §2.1 — a system-statement variant renders whole, never token-by-token. */
export function Message({
  text,
  ts,
  streaming = false,
  variant,
}: MessageProps): JSX.Element {
  if (variant === "system") return <SystemStatement text={text} />;

  return (
    <div className={styles.message}>
      {ts !== undefined && <div className={styles.meta}>agent · {ts}</div>}
      <p className={styles.agent}>
        {text}
        {streaming && <span className={styles.caret} aria-hidden="true" />}
      </p>
    </div>
  );
}
