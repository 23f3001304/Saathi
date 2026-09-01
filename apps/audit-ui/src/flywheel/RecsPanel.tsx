import type { JSX } from "react";
import styles from "./RecsPanel.module.css";

const TOOL_SIGNATURE = `tool: recs.suggest(user_id: string, category?: string) -> {
  sku: string, rationale: string, fold_evidence: string[]
}[]`;

const CURL_EXAMPLE = `curl -s https://gateway.example/recs?user_id=u_123&category=apparel`;

/**
 * §2.3 D13 — "no recommendation carousel... an agent-readable data product,
 * presented as one." The flywheel turning, not a trained model pretending to.
 */
export function RecsPanel(): JSX.Element {
  return (
    <div>
      <p className={styles.caption}>/recs: MCP tool signature</p>
      <pre className={styles.panel}>
        {TOOL_SIGNATURE}
        {"\n\n"}
        {CURL_EXAMPLE}
      </pre>
    </div>
  );
}
