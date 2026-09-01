// §2.1 — the six-section causal chain: intent → memories → cart → verdicts
// → Razorpay → outcome, plus the envelope burn-down beneath it.
import type { JSX } from "react";
import type { TxnView } from "../ledger/reducer.ts";
import type { Envelope } from "../api/types.ts";
import type { CooloffPayload } from "../ledger/types.ts";
import { ChainSection } from "./ChainSection.tsx";
import { IntentPanel } from "./IntentPanel.tsx";
import { MemoryRail } from "./MemoryRail.tsx";
import { CartPanel } from "./CartPanel.tsx";
import { SealRow } from "./SealRow.tsx";
import { RailCalls } from "./RailCalls.tsx";
import { OutcomeStrip } from "./OutcomeStrip.tsx";
import { EnvelopeBars } from "./EnvelopeBars.tsx";
import type { SealView } from "../ledger/selectors.ts";
import {
  cartFacts,
  intentFacts,
  memoryFacts,
  outcomeFacts,
  railFacts,
  verdictFacts,
} from "./chain-steps.ts";
import styles from "./CausalChain.module.css";

type CausalChainProps = {
  txn: TxnView | undefined;
  loadingIntent: boolean;
  cooloff?: CooloffPayload;
  envelopes: Envelope[];
  onInspectDigest: () => void;
  onInspectSeal: (seal: SealView) => void;
  onSelectEnvelope?: (category: string) => void;
};

export function CausalChain({
  txn,
  loadingIntent,
  cooloff,
  envelopes,
  onInspectDigest,
  onInspectSeal,
  onSelectEnvelope,
}: CausalChainProps): JSX.Element {
  return (
    <div className={styles.chain}>
      <ChainSection index={0} title="Your ask" {...intentFacts(txn)}>
        <IntentPanel intent={txn?.intent} loading={loadingIntent} />
      </ChainSection>
      <ChainSection index={1} title="What it relied on" {...memoryFacts(txn)}>
        <MemoryRail memories={txn?.memories ?? []} />
      </ChainSection>
      <ChainSection index={2} title="Cart built" {...cartFacts(txn)}>
        <CartPanel cart={txn?.cart} onInspectDigest={onInspectDigest} />
      </ChainSection>
      <ChainSection
        index={3}
        title="Checks"
        meta={
          txn?.verdictLatencyMs !== undefined
            ? `${txn.verdictLatencyMs} ms`
            : undefined
        }
        {...verdictFacts(txn, cooloff)}
      >
        <SealRow
          checks={txn?.checks ?? []}
          stage0Rejection={txn?.stage0Rejection}
          cooloff={cooloff}
          latencyMs={txn?.verdictLatencyMs}
          onInspect={onInspectSeal}
        />
      </ChainSection>
      <ChainSection index={4} title="Payment rail" {...railFacts(txn)}>
        <RailCalls calls={txn?.rzpCalls ?? []} />
      </ChainSection>
      <ChainSection
        index={5}
        title="Outcome"
        defaultOpen
        {...outcomeFacts(txn)}
      >
        <OutcomeStrip outcome={txn?.outcome} />
        <div className={styles.envelopes}>
          <EnvelopeBars envelopes={envelopes} onSelect={onSelectEnvelope} />
        </div>
      </ChainSection>
    </div>
  );
}
