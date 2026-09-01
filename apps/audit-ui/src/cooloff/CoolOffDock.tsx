// §2.4 D2 — persistent dock, not a route: a live countdown you have to
// navigate to is a countdown you don't see.
import { useState, type JSX } from "react";
import { useLedgerSelector } from "../ledger/useLedger.ts";
import { selectCooloffList } from "../ledger/selectors.ts";
import type { CooloffPayload } from "../ledger/types.ts";
import { cancelCooloff, restoreCooloff } from "../api/gateway.ts";
import { CoolOffCard } from "./CoolOffCard.tsx";
import { UndoStrip } from "./UndoStrip.tsx";
import { Countdown } from "../primitives/Countdown.tsx";
import { Money } from "../primitives/Money.tsx";
import { Glyph } from "../primitives/Glyph.tsx";
import styles from "./CoolOffDock.module.css";

type UndoState = { item: CooloffPayload };

/**
 * DECISION: cancel/undo apply a local optimistic override on top of the
 * ledger-derived list. In production the gateway's `cooloff.cancelled` /
 * `.released` frame streams back and this override is unnecessary; the
 * fixture transport replays a fixed reel with no live write-back path.
 */
export function CoolOffDock(): JSX.Element | null {
  const ledgerItems = useLedgerSelector(selectCooloffList);
  const [expanded, setExpanded] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pendingUndo, setPendingUndo] = useState<UndoState | null>(null);

  const items = ledgerItems.filter((item) => !hiddenIds.has(item.id));

  async function handleCancel(item: CooloffPayload): Promise<void> {
    setHiddenIds((prev) => new Set(prev).add(item.id));
    setPendingUndo({ item });
    await cancelCooloff(item.id);
  }

  async function handleUndo(): Promise<void> {
    if (pendingUndo === null) return;
    const { item } = pendingUndo;
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
    setPendingUndo(null);
    await restoreCooloff(item.id);
  }

  if (items.length === 0 && pendingUndo === null) return null;

  const first = items[0];

  return (
    <div className={styles.dock}>
      {pendingUndo !== null && (
        <UndoStrip
          amountPaise={pendingUndo.item.amount_paise}
          category={pendingUndo.item.merchant}
          onUndo={() => void handleUndo()}
          onExpire={() => setPendingUndo(null)}
        />
      )}
      {items.length > 0 && (
        <button
          type="button"
          className={styles.collapsedBar}
          onClick={() => setExpanded((v) => !v)}
        >
          <span>{items.length} on hold</span>
          {first !== undefined && (
            <>
              <Money paise={first.amount_paise} />
              <span>
                releases in <Countdown releaseAt={first.release_at} />
              </span>
              <span>{first.merchant}</span>
            </>
          )}
          <span
            className={
              expanded
                ? `${styles.chevron} ${styles.chevronOpen}`
                : styles.chevron
            }
          >
            <Glyph name="chevron" />
          </span>
        </button>
      )}
      {expanded && items.length > 0 && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <span>Held by your cool-off rule</span>
          </div>
          {items.map((item) => (
            <CoolOffCard
              key={item.id}
              item={item}
              cancelling={false}
              onCancel={() => void handleCancel(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
