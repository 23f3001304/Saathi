// §2.1 — the Audit Instrument: attack gutter | causal chain | kolam thread.
import type { JSX } from "react";
import { useLedgerSelector } from "../ledger/useLedger.ts";
import {
  selectTxn,
  selectCooloffForTxn,
  type SealView,
} from "../ledger/selectors.ts";
import type { TxnView } from "../ledger/reducer.ts";
import { useResource } from "../api/useResource.ts";
import { fetchCovenant } from "../api/gateway.ts";
import { AttackLane } from "./AttackLane.tsx";
import { CausalChain } from "./CausalChain.tsx";
import styles from "./Instrument.module.css";

type InstrumentProps = {
  txnId: string | null;
  offline: boolean;
  onInspectDigest: (txn: TxnView) => void;
  onInspectSeal: (seal: SealView, txn: TxnView) => void;
  onKnotClick?: (eventId: number) => void;
};

function EmptyInstrument(): JSX.Element {
  return (
    <div className={styles.empty}>
      <p>
        Nothing to show yet. What appears here is rebuilt from the ledger, not
        told to us by the agent.
      </p>
    </div>
  );
}

export function Instrument({
  txnId,
  offline,
  onInspectDigest,
  onInspectSeal,
  onKnotClick,
}: InstrumentProps): JSX.Element {
  const txn = useLedgerSelector((state) => selectTxn(state, txnId));
  const attacks = useLedgerSelector((state) => state.attackEvents);
  const txns = useLedgerSelector((state) => state.txns);
  const cooloff = useLedgerSelector((state) =>
    txnId !== null ? selectCooloffForTxn(state, txnId) : undefined,
  );
  const covenant = useResource(fetchCovenant, []);

  const classes = offline
    ? `${styles.instrument} ${styles.offline}`
    : styles.instrument;

  if (txn === undefined) {
    return (
      <div className={classes} data-instrument="true">
        <EmptyInstrument />
      </div>
    );
  }

  return (
    <div className={classes} data-instrument="true">
      <AttackLane attacks={attacks} txns={txns} onPin={onKnotClick} />
      <div className={styles.chainColumn}>
        {offline && (
          <p className={styles.offlineBanner}>
            Nothing is answering, so nothing can be bought right now.
          </p>
        )}
        <CausalChain
          txn={txn}
          loadingIntent={false}
          cooloff={cooloff}
          envelopes={covenant.data?.envelopes ?? []}
          onInspectDigest={() => onInspectDigest(txn)}
          onInspectSeal={(seal) => onInspectSeal(seal, txn)}
        />
      </div>
    </div>
  );
}
