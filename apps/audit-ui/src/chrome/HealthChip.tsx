// §2.0 — gateway health, polled every 5s. Down flips the whole Instrument
// into its offline (fail-closed) state; this chip is where that starts.
import { useEffect, useState, type JSX } from "react";
import { fetchReadyz } from "../api/gateway.ts";
import type { HealthChecks } from "../api/types.ts";
import styles from "./HealthChip.module.css";

export type HealthState = "ready" | "degraded" | "down";

const POLL_MS = 5000;

/** The chip is chrome a shopper reads, so it says the state, not the check. */
const STATE_LABEL: Record<HealthState, string> = {
  ready: "Connected",
  degraded: "Partly connected",
  down: "Not connected",
};

/** The check names, as the thing a person would call it. */
const CHECK_NAME: Record<string, string> = {
  ledgerOpen: "the ledger",
  jwksLoaded: "the list of keys we trust",
  rzpReachable: "Razorpay",
};

function stateFor(checks: HealthChecks | null): HealthState {
  if (checks === null) return "down";
  const values = Object.values(checks);
  if (values.every(Boolean)) return "ready";
  if (values.some(Boolean)) return "degraded";
  return "down";
}

function failing(checks: HealthChecks): string[] {
  return (Object.entries(checks) as Array<[string, boolean]>)
    .filter(([, ok]) => !ok)
    .map(([key]) => CHECK_NAME[key] ?? key);
}

type HealthChipProps = { onStateChange?: (state: HealthState) => void };

export function HealthChip({ onStateChange }: HealthChipProps): JSX.Element {
  const [checks, setChecks] = useState<HealthChecks | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = (): void => {
      fetchReadyz()
        .then((res) => !cancelled && setChecks(res.checks))
        .catch(() => !cancelled && setChecks(null));
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const state = stateFor(checks);
  useEffect(() => onStateChange?.(state), [state, onStateChange]);
  const dotClass =
    state === "ready"
      ? styles.dot
      : state === "degraded"
        ? `${styles.dot} ${styles.degraded}`
        : `${styles.dot} ${styles.down}`;
  const title =
    checks !== null && state !== "ready"
      ? `Not answering: ${failing(checks).join(", ")}`
      : undefined;

  return (
    <span className={styles.chip} title={title}>
      <span className={dotClass} aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}
