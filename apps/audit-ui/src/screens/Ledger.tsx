// §2.3 S3 — the flywheel and the integrity proof. Denser than S1; this
// screen is allowed to look like a terminal.
import type { JSX } from "react";
import { useLedgerSelector } from "../ledger/useLedger.ts";
import { useResource } from "../api/useResource.ts";
import {
  fetchFoldSummary,
  fetchMerchantTrust,
  fetchPriceHistory,
} from "../api/gateway.ts";
import { Panel } from "../primitives/Panel.tsx";
import { Hash } from "../primitives/Hash.tsx";
import { ChainChip } from "../chrome/ChainChip.tsx";
import { FoldGrid } from "../flywheel/FoldGrid.tsx";
import { MerchantTrust } from "../flywheel/MerchantTrust.tsx";
import { ReplayProof } from "../flywheel/ReplayProof.tsx";
import { PriceSparkline } from "../flywheel/PriceSparkline.tsx";
import { EventStream } from "../flywheel/EventStream.tsx";
import { RecsPanel } from "../flywheel/RecsPanel.tsx";
import styles from "./Ledger.module.css";

type LedgerProps = {
  onSelectSku: (sku: string) => void;
  onSelectTxn: (txnId: string) => void;
};

export function Ledger({ onSelectSku, onSelectTxn }: LedgerProps): JSX.Element {
  const height = useLedgerSelector((s) => s.lastId);
  const headHash = useLedgerSelector((s) => s.headHash);
  const frames = useLedgerSelector((s) => s.frames);
  const foldSummary = useResource(fetchFoldSummary, []);
  const merchantTrust = useResource(fetchMerchantTrust, []);
  const priceHistory = useResource(
    () => fetchPriceHistory("sundar-kurta-navy"),
    [],
  );

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>The ledger</h1>
      <p className={styles.tagline}>
        Every event this system has ever produced, hash-chained: nothing here
        can be edited, only added to.
      </p>
      <div className={styles.header}>
        <span>{height.toLocaleString("en-IN")} events</span>
        {headHash !== null && (
          <span>
            head <Hash value={headHash} />
          </span>
        )}
        <ChainChip />
      </div>

      <Panel title="What the ledger has learned">
        <FoldGrid folds={foldSummary.data ?? []} onSelect={onSelectSku} />
      </Panel>

      <div className={styles.row}>
        <Panel title="Which merchants keep their word">
          <MerchantTrust merchants={merchantTrust.data ?? []} />
        </Panel>
        <Panel title="Prove it: replay from zero">
          <ReplayProof />
        </Panel>
      </div>

      <Panel title="What the kurta actually sold for">
        <PriceSparkline
          points={priceHistory.data ?? []}
          width={640}
          height={64}
          caption="Crimson marks the days it carried a higher listed price. The shaded band is what it usually sold for."
        />
      </Panel>

      <details className={styles.auditor}>
        <summary className={styles.auditorSummary}>For auditors</summary>
        <Panel title="The raw stream">
          <EventStream frames={frames} onSelectTxn={onSelectTxn} />
        </Panel>
        <Panel title="What it would recommend">
          <RecsPanel />
        </Panel>
      </details>
    </div>
  );
}
