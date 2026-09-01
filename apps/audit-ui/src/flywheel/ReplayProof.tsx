// §2.3 N3 — re-folding the whole ledger and comparing state hashes, live.
import { useState, type JSX } from "react";
import { replayLedger } from "../api/gateway.ts";
import type { ReplayResult } from "../api/types.ts";
import { Hash } from "../primitives/Hash.tsx";
import styles from "./ReplayProof.module.css";

type ReplayState = "idle" | "running" | "done";

export function ReplayProof(): JSX.Element {
  const [state, setState] = useState<ReplayState>("idle");
  const [result, setResult] = useState<ReplayResult | null>(null);

  async function handleReplay(): Promise<void> {
    setState("running");
    const res = await replayLedger();
    setResult(res);
    setState("done");
  }

  const identical = result?.ok === true;
  const ruleClass =
    state === "done"
      ? identical
        ? `${styles.rule} ${styles.identical}`
        : `${styles.rule} ${styles.divergent}`
      : styles.rule;

  return (
    <div className={styles.panel}>
      <div className={styles.columns}>
        <span>
          live {result !== null && <Hash value={result.liveStateHash} full />}
        </span>
        <span>
          replayed{" "}
          {result !== null && <Hash value={result.replayedStateHash} full />}
        </span>
      </div>
      <hr className={ruleClass} />
      {state === "done" && result !== null && (
        <p className={styles.meta}>
          {identical
            ? "identical"
            : `differs at event ${result.firstDivergentId ?? "?"}`}{" "}
          · {result.events.toLocaleString("en-IN")} events · {result.ms} ms
        </p>
      )}
      <button
        type="button"
        className={styles.button}
        onClick={() => void handleReplay()}
        disabled={state === "running"}
      >
        {state === "running" ? "Replaying…" : "Replay from zero"}
      </button>
    </div>
  );
}
