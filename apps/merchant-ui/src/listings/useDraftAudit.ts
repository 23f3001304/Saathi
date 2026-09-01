import { useEffect, useState } from "react";
import { fetchDraftAudit } from "../api/merchantInsightApi.ts";
import type { CueView } from "../api/merchantTypes.ts";

const DEBOUNCE_MS = 450;

export type DraftAudit = {
  cues: CueView[];
  /** False while the merchant is still typing, or when there is no gateway. */
  checked: boolean;
};

/**
 * The audit, running beside the field the merchant is typing into.
 *
 * This is the whole reason the audit is not a page of its own. A shopkeeper
 * writing "Only 2 left! Was MRP 2,999" is told, in the moment they write it,
 * that a buyer agent reads that as scarcity and a false anchor — before it is
 * live copy that has already cost them a reading.
 *
 * The findings come from the gateway, which runs `detectAcross` from
 * packages/memory. Reimplementing the eight patterns in the browser would make
 * this a second opinion about the copy; it is meant to be the first-person
 * finding the buyer will make, so it must be the same code.
 */
export function useDraftAudit(name: string, description: string): DraftAudit {
  const [cues, setCues] = useState<CueView[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let live = true;
    setChecked(false);
    const timer = setTimeout(() => {
      void fetchDraftAudit(name, description).then((audit) => {
        if (!live) return;
        setCues(audit?.listings[0]?.cues ?? []);
        setChecked(audit !== null);
      });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [name, description]);

  return { cues, checked };
}
