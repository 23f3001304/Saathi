// §2.5 O2 / D12 — the 3:00 demo beat: sha256 recomputed in the browser,
// checked against the Cart Mandate's own claim.
import { useEffect, useState, type JSX } from "react";
import type { MemoryEntryView } from "../ledger/reducer.ts";
import { computeMemoryDigest, concatenateSortedHashes } from "./digest.ts";
import { Hash } from "../primitives/Hash.tsx";
import { Glyph } from "../primitives/Glyph.tsx";
import styles from "./DigestInspector.module.css";

type DigestInspectorProps = {
  memories: MemoryEntryView[];
  claimedDigest: string;
  txnId: string;
  cartId: string;
  onClose: () => void;
};

type DecodedJwt = { header: object; payload: Record<string, unknown> };

function decodedCartMandate(
  txnId: string,
  cartId: string,
  memoryDigest: string,
): DecodedJwt {
  return {
    header: { alg: "ES256", typ: "JWT" },
    payload: {
      iss: "gateway-svc",
      sub: txnId,
      aud: "razorpay",
      jti: cartId,
      cart_hash: cartId,
      memory_digest: memoryDigest,
    },
  };
}

function useComputedDigest(hashes: string[]): string | null {
  const [digest, setDigest] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void computeMemoryDigest(hashes).then((value) => {
      if (!cancelled) setDigest(value);
    });
    return () => {
      cancelled = true;
    };
  }, [hashes.join(",")]);
  return digest;
}

export function DigestInspector({
  memories,
  claimedDigest,
  txnId,
  cartId,
  onClose,
}: DigestInspectorProps): JSX.Element {
  const sorted = [...memories].sort((a, b) => a.hash.localeCompare(b.hash));
  const hashes = sorted.map((m) => m.hash);
  const computed = useComputedDigest(hashes);
  const matched = computed !== null && computed === claimedDigest;
  const jwt = decodedCartMandate(txnId, cartId, claimedDigest);

  return (
    <>
      <button
        type="button"
        className={styles.backdrop}
        onClick={onClose}
        aria-label="Close digest inspector"
      />
      <aside
        className={styles.sheet}
        role="dialog"
        aria-label="Digest inspector"
      >
        <button type="button" className={styles.closeButton} onClick={onClose}>
          <Glyph name="cross" />
        </button>
        <section className={styles.band}>
          <h2 className={styles.title}>Justifying memories, sorted by hash</h2>
          {sorted.map((entry) => (
            <div className={styles.entryRow} key={entry.id}>
              <span>
                {entry.type} · {entry.tier}
              </span>
              <Hash value={entry.hash} />
            </div>
          ))}
        </section>
        <section className={styles.band}>
          <h2 className={styles.title}>Recomputed, in your browser</h2>
          <p className={styles.concat}>{concatenateSortedHashes(hashes)}</p>
          <Hash value={computed ?? "computing…"} full />
        </section>
        <section className={styles.band}>
          <h2 className={styles.title}>Cart Mandate claim</h2>
          <pre className={styles.jwt}>
            {JSON.stringify(jwt.header)}
            {"\n"}
            {JSON.stringify(
              { ...jwt.payload, memory_digest: undefined },
              null,
              0,
            )}
            {"\n"}
            <span className={styles.claim}>
              "memory_digest": "{claimedDigest}"
            </span>
          </pre>
        </section>
        <hr
          className={
            matched
              ? `${styles.matchRule} ${styles.matchRuleShown}`
              : styles.matchRule
          }
        />
        {matched && (
          <p className={styles.matchCaption}>
            recomputed in your browser · identical
          </p>
        )}
      </aside>
    </>
  );
}
