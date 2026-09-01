import { useEffect, useReducer, useState, type JSX } from "react";
import { useOptionalLedgerStore } from "../ledger/LedgerProvider.tsx";
import type { TransportStatus } from "./assistantTransport.ts";
import styles from "./Chat.module.css";

const COPY: Partial<Record<TransportStatus, string>> = {
  fixtures: "Nothing is connected. This is a scripted demo, not a real run.",
  connecting: "Connecting…",
  degraded: "Still live, just slower: the fast connection dropped.",
  offline:
    "Nothing is answering, so this is a scripted demo. Nothing below is a real run.",
};

/** The status word, as a person would say it rather than as the code spells it. */
const LABEL: Partial<Record<TransportStatus, string>> = {
  fixtures: "demo",
  connecting: "connecting",
  degraded: "slower",
  offline: "offline",
};

/** The rung states the ladder passes through on a blip. Painting them the
 *  instant they happen made every reconnect flash a banner over a working
 *  chat — the agent read as breaking when only a socket was. They earn the
 *  screen by persisting; `fixtures` and `offline` are honesty states and
 *  still paint immediately. */
const TRANSIENT: readonly TransportStatus[] = ["connecting", "degraded"];
const TRANSIENT_AFTER_MS = 1_500;

function useSettledStatus(status: TransportStatus): TransportStatus {
  const [shown, setShown] = useState(status);
  useEffect(() => {
    if (!TRANSIENT.includes(status)) {
      setShown(status);
      return;
    }
    const timer = setTimeout(() => setShown(status), TRANSIENT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [status]);
  return shown;
}

/**
 * §4.4's honesty rule, applied to provenance: the screen must never let a
 * fixture pass for a run. `live` is the only status with nothing to declare,
 * so it is the only one that renders nothing at all.
 */
export function TransportNotice({
  status,
  detail,
}: {
  status: TransportStatus;
  detail: string | null;
}): JSX.Element | null {
  const settled = useSettledStatus(status);
  const copy = COPY[settled];
  if (copy === undefined) return null;
  const tone =
    settled === "offline"
      ? styles.notice
      : `${styles.notice} ${styles.noticeDegraded}`;
  return (
    <p className={tone}>
      <span className={styles.noticeLabel}>{LABEL[settled] ?? settled}</span>
      <span>
        {copy}
        {detail !== null && ` (${detail})`}
      </span>
    </p>
  );
}

/**
 * The ledger's own provenance, in the one column a buyer actually reads. The
 * chain chip in the top bar reports the connection; this reports whether the
 * frames behind it came from a gateway at all.
 */
export function LedgerNotice(): JSX.Element | null {
  const store = useOptionalLedgerStore();
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => store?.subscribe(bump), [store]);
  const state = store?.getState();
  if (state === undefined) return null;
  if (state.source === "live" || state.connectionMode !== "offline") return null;
  return (
    <p className={styles.notice}>
      <span className={styles.noticeLabel}>offline</span>
      <span>
        Nothing is answering, so the events below are made up. None of it has
        been checked against a real ledger.
      </span>
    </p>
  );
}
