// §2.0 — height + head hash from the ledger's own state; `[verify]` re-runs
// the hash chain and shows the honest number on camera (N1 evidence).
import { useState, type JSX } from "react";
import { useLedgerSelector } from "../ledger/useLedger.ts";
import { verifyLedger } from "../api/gateway.ts";
import { Hash } from "../primitives/Hash.tsx";
import styles from "./ChainChip.module.css";

const VERIFIED_BADGE_MS = 4000;

type VerifyState = {
  verifying: boolean;
  result?: { height: number; ms: number };
};

export function ChainChip(): JSX.Element {
  const height = useLedgerSelector((s) => s.lastId);
  const headHash = useLedgerSelector((s) => s.headHash);
  const mode = useLedgerSelector((s) => s.connectionMode);
  const [verify, setVerify] = useState<VerifyState>({ verifying: false });

  async function handleVerify(): Promise<void> {
    setVerify({ verifying: true });
    const res = await verifyLedger();
    setVerify({ verifying: false, result: { height: res.height, ms: res.ms } });
    setTimeout(() => setVerify({ verifying: false }), VERIFIED_BADGE_MS);
  }

  return (
    <span
      className={
        mode === "polling" ? `${styles.chip} ${styles.polling}` : styles.chip
      }
      aria-live="off"
    >
      chain ⛓ {height.toLocaleString("en-IN")} ·{" "}
      {headHash !== null && <Hash value={headHash} />}
      {verify.verifying ? (
        <span>verifying…</span>
      ) : verify.result !== undefined ? (
        <span>
          verified · {verify.result.height.toLocaleString("en-IN")} events ·{" "}
          {verify.result.ms} ms
        </span>
      ) : (
        <button
          type="button"
          className={styles.verify}
          onClick={() => void handleVerify()}
        >
          Verify
        </button>
      )}
      {mode === "polling" && <span>no live feed</span>}
    </span>
  );
}
