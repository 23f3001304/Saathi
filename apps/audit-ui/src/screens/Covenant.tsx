// §2.2 S2. the Ulysses contracts. D9: every edit is an inert amendment
// until sealed; nothing here PATCHes until the hold-to-seal ceremony lands.
import { useState, type JSX } from "react";
import { useResource } from "../api/useResource.ts";
import { fetchCovenant } from "../api/gateway.ts";
import type { SealFailure } from "../api/agent.ts";
import { sealCovenant } from "../api/agent.ts";
import type { Constraint } from "../api/types.ts";
import { RuleSentences } from "../covenant/RuleSentences.tsx";
import { AddRule } from "../covenant/AddRule.tsx";
import { EnvelopeEditor } from "../covenant/EnvelopeEditor.tsx";
import { CoolOffRules } from "../covenant/CoolOffRules.tsx";
import { ScopeLists } from "../covenant/ScopeLists.tsx";
import { AmendmentFooter } from "../covenant/AmendmentFooter.tsx";
import { ProposedAmendments } from "../covenant/ProposedAmendments.tsx";
import {
  clearAmendments,
  usePendingAmendments,
  withdrawAmendment,
} from "../covenant/pendingAmendments.ts";
import type { CooloffDraft, ScopeDraft } from "../covenant/sealLines.ts";
import { sealLines, withAmendments } from "../covenant/sealLines.ts";
import { sealRequest } from "../covenant/sealRequest.ts";
import type { SigningRequest } from "../ui/overlays.ts";
import { StreamText } from "../conversation/StreamText.tsx";
import styles from "./Covenant.module.css";

type CovenantProps = { onRequestSign: (req: SigningRequest) => void };

export function Covenant({ onRequestSign }: CovenantProps): JSX.Element {
  // Bumped when a seal lands, so the rows show the covenant the ledger now
  // holds rather than the one this screen mounted with. A sealed change that
  // only appeared after a manual reload read as a seal that did nothing.
  const [sealedCount, setSealedCount] = useState(0);
  const covenant = useResource(fetchCovenant, [sealedCount]);
  const [amendments, setAmendments] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Constraint[]>([]);
  const [envCaps, setEnvCaps] = useState<Record<string, string>>({});
  const [cooloff, setCooloff] = useState<CooloffDraft>({});
  const [scopeAdds, setScopeAdds] = useState<ScopeDraft>({
    merchants: [],
    skus: [],
  });
  const proposed = usePendingAmendments();
  const [refused, setRefused] = useState<SealFailure | null>(null);

  const constraints = withAmendments(
    covenant.data?.constraints ?? [],
    amendments,
  );

  const envelopes = (covenant.data?.envelopes ?? []).map((e) =>
    envCaps[e.category] !== undefined
      ? { ...e, capPaise: Number(envCaps[e.category]), amended: true }
      : { ...e, amended: false },
  );

  const cooloffRules = (covenant.data?.cooloffRules ?? []).map((r) => ({
    thresholdPaise:
      cooloff.thresholdPaise !== undefined
        ? Number(cooloff.thresholdPaise)
        : r.thresholdPaise,
    durationHours:
      cooloff.durationHours !== undefined
        ? Number(cooloff.durationHours)
        : r.durationHours,
  }));

  const lines = sealLines({
    constraints,
    added,
    envCaps,
    cooloff,
    scopeAdds,
    proposed,
  });
  const unsignedCount = lines.length;

  function reset(): void {
    setAmendments({});
    setAdded([]);
    setEnvCaps({});
    setCooloff({});
    setScopeAdds({ merchants: [], skus: [] });
    clearAmendments();
  }

  const drafts = { constraints, added, envCaps, cooloff, scopeAdds, proposed };

  // The drafts are cleared only once the ledger has the change. Clearing first
  // is what made a failed seal look like a successful one.
  async function commit(description: string): Promise<void> {
    const failure = await sealCovenant(sealRequest(drafts, description));
    setRefused(failure);
    if (failure === null || failure.sealed) {
      reset();
      setSealedCount((count) => count + 1);
    }
  }

  function handleSeal(): void {
    const description =
      unsignedCount === 1
        ? "This change takes effect when you sign, and not before."
        : `These ${unsignedCount} changes take effect when you sign, and not before.`;
    setRefused(null);
    onRequestSign({
      title: "Sign your changes",
      description,
      lines,
      thumbprint: "did:key:z6Mk8Qr2f",
      onSigned: () => void commit(description),
    });
  }

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <span className={styles.eyebrow}>Your rules</span>
        <h1 className={styles.title}>The lines I cannot cross</h1>
        <p className={styles.voice}>
          <StreamText text="Change any of them, or add your own. Nothing takes effect until you sign it." />
        </p>
      </header>
      <ProposedAmendments
        amendments={proposed}
        onWithdraw={withdrawAmendment}
      />
      <div className={styles.card}>
        <RuleSentences
          constraints={[...constraints, ...added]}
          onAmend={(key, next) => {
            if (added.some((c) => c.key === key)) {
              setAdded((prev) =>
                prev.map((c) => (c.key === key ? { ...c, value: next } : c)),
              );
              return;
            }
            setAmendments((prev) => ({ ...prev, [key]: next }));
          }}
          onDelete={(key) =>
            setAdded((prev) => prev.filter((c) => c.key !== key))
          }
        />
        <AddRule
          onAdd={(rule) => setAdded((prev) => [...prev, rule])}
          taken={new Set([...constraints, ...added].map((c) => c.key))}
        />
      </div>
      <div className={styles.pair}>
        <div className={styles.card}>
          <EnvelopeEditor
            envelopes={envelopes}
            onAmendCap={(category, next) =>
              setEnvCaps((prev) => ({ ...prev, [category]: next }))
            }
          />
        </div>
        <div className={styles.card}>
          <CoolOffRules
            rules={cooloffRules}
            amended={cooloff}
            onAmend={(field, next) =>
              setCooloff((prev) => ({ ...prev, [field]: next }))
            }
          />
        </div>
      </div>
      <div className={styles.card}>
        <ScopeLists
          merchants={[
            ...(covenant.data?.merchants ?? []),
            ...scopeAdds.merchants,
          ]}
          skus={[...(covenant.data?.skus ?? []), ...scopeAdds.skus]}
          pending={scopeAdds}
          onAdd={(list, name) =>
            setScopeAdds((prev) =>
              prev[list].includes(name)
                ? prev
                : { ...prev, [list]: [...prev[list], name] },
            )
          }
          onRemovePending={(list, name) =>
            setScopeAdds((prev) => ({
              ...prev,
              [list]: prev[list].filter((n) => n !== name),
            }))
          }
        />
      </div>
      {refused !== null ? (
        <p className={styles.refused} role="alert">
          {refused.human}
          {refused.sealed ? "" : " Your changes are still here, unsigned."}
        </p>
      ) : null}
      <AmendmentFooter unsignedCount={unsignedCount} onOpenSheet={handleSeal} />
    </div>
  );
}
