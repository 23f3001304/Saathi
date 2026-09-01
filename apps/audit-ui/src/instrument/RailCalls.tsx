import type { JSX } from "react";
import type { RzpCallPayload } from "../ledger/types.ts";
import { Hash } from "../primitives/Hash.tsx";
import styles from "./RailCalls.module.css";

type RailCallsProps = {
  calls: RzpCallPayload[];
};

/** §2.1 §5 / §A.3 — `Idempotency-Key = jti` and `agent_present` shown, not buried. */
export function RailCalls({ calls }: RailCallsProps): JSX.Element {
  if (calls.length === 0)
    return <p className={styles.row}>No Razorpay calls yet.</p>;

  return (
    <div className={styles.list}>
      {calls.map((call, i) => (
        <div className={styles.row} key={`${call.call}-${i}`}>
          <span>{call.call}</span>
          <Hash value={call.id} />
          <span className={styles.key}>
            Idempotency-Key = {call.idempotency_key}
          </span>
          <span
            className={call.agent_present ? styles.agentPresent : undefined}
          >
            agent_present: {String(call.agent_present)}
          </span>
        </div>
      ))}
    </div>
  );
}
