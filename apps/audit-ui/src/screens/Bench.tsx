// §2.1 S1 — The Bench. Two states, one screen:
//
//   collapsed (default) — the buyer's screen. One centred column: the
//     conversation, the options being decided, the cart, and a single
//     trust summary line. Calm, consumer-grade, fits 1280x720 unscrolled.
//   expanded — the Audit Instrument unfolds beside it: intent, memories,
//     digest, the eight seals, the Razorpay calls, the outcome, the
//     envelope burn-down, the txn rail. Nothing was removed to get the
//     calm view; it is folded behind the summary and one click away.
import { useRef, useState, type JSX } from "react";
import { useLedgerSelector } from "../ledger/useLedger.ts";
import {
  deriveSealStates,
  selectCooloffForTxn,
  selectTxn,
} from "../ledger/selectors.ts";
import type { TxnView } from "../ledger/reducer.ts";
import type { SealView } from "../ledger/selectors.ts";
import { useUnfold } from "../motion/useUnfold.ts";
import { Chat } from "../conversation/Chat.tsx";
import { Instrument } from "../instrument/Instrument.tsx";
import { TrustSummary } from "../instrument/TrustSummary.tsx";
import type { DigestRequest } from "../ui/overlays.ts";
import styles from "./Bench.module.css";

type BenchProps = {
  offline: boolean;
  onRequestDigestInspect: (req: DigestRequest) => void;
};

function digestRequestFor(txn: TxnView): DigestRequest {
  return {
    memories: txn.memories.filter(
      (m) => txn.cart?.justified_by.includes(m.id) ?? false,
    ),
    claimedDigest: txn.cart?.memory_digest ?? "",
    txnId: txn.txnId,
    cartId: txn.cart?.cart_id ?? "",
  };
}

function digestVerified(seals: SealView[]): boolean {
  return seals.find((s) => s.check === "memory_digest")?.state === "passed";
}

export function Bench({
  offline,
  onRequestDigestInspect,
}: BenchProps): JSX.Element {
  const liveTxnId = useLedgerSelector((s) => s.liveTxnId);
  const [selectedTxnId] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const activeTxnId = selectedTxnId ?? liveTxnId;
  const txn = useLedgerSelector((s) => selectTxn(s, activeTxnId));
  const cooloff = useLedgerSelector((s) =>
    activeTxnId !== null ? selectCooloffForTxn(s, activeTxnId) : undefined,
  );
  const instrumentRef = useRef<HTMLDivElement>(null);
  useUnfold(instrumentRef, inspecting);

  const seals = deriveSealStates(txn?.checks ?? [], cooloff);

  function handleInspectDigest(target: TxnView): void {
    onRequestDigestInspect(digestRequestFor(target));
  }

  const trust = (
    <TrustSummary
      seals={seals}
      latencyMs={txn?.verdictLatencyMs}
      digestVerified={digestVerified(seals)}
      expanded={inspecting}
      onToggle={() => setInspecting((open) => !open)}
    />
  );

  return (
    <div
      className={
        inspecting
          ? `${styles.bench} ${styles.inspecting}`
          : `${styles.bench} ${styles.calm}`
      }
    >
      <div className={styles.conversationColumn}>
        <Chat offline={offline} trust={trust} />
      </div>
      {inspecting && (
        <div
          className={styles.instrumentColumn}
          id="audit-instrument"
          ref={instrumentRef}
        >
          <header className={styles.drawerHead}>
            <span className={styles.drawerTitle}>
              This purchase, step by step
            </span>
            <button
              type="button"
              className={styles.drawerClose}
              aria-label="Close"
              onClick={() => setInspecting(false)}
            >
              <svg
                viewBox="0 0 12 12"
                width="12"
                height="12"
                aria-hidden="true"
              >
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>
          <Instrument
            txnId={activeTxnId}
            offline={offline}
            onInspectDigest={handleInspectDigest}
            onInspectSeal={() => undefined}
          />
        </div>
      )}
    </div>
  );
}
