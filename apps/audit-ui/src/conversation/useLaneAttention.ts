// The shelf's read of every lane at once. `onStatus` still flows from each
// mounted session, but a hidden chat's transport can be rebasing or offline;
// this endpoint is the host's own account, so the badge and the notification
// come from here.
import { useEffect, useRef, useState } from "react";

import { agentBaseUrl } from "../api/liveMode.ts";
import { fetchLanes, type AttentionKind, type LaneRow } from "../api/lanes.ts";

export const LANE_POLL_MS = 4_000;

export type LaneBadges = ReadonlyMap<string, LaneRow>;

function keyed(rows: readonly LaneRow[]): Map<string, LaneRow> {
  const next = new Map<string, LaneRow>();
  for (const row of rows) {
    if (row.conversation !== null) next.set(row.conversation, row);
  }
  return next;
}

/** Stable identity for an unchanged answer, so a 4-second poll does not
 *  re-render the whole shelf 900 times an hour. */
function same(before: LaneBadges, after: LaneBadges): boolean {
  if (before.size !== after.size) return false;
  for (const [chat, row] of after) {
    const held = before.get(chat);
    if (
      held === undefined ||
      held.running !== row.running ||
      held.queued !== row.queued ||
      held.attention !== row.attention
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Polls `GET /chat/lanes` while a host is configured and reports one event
 * per *transition into* an attention state: the moment a lane parks needing a
 * person is the moment worth a notification, and repeating it every tick
 * would train the shopper to dismiss them.
 */
export function useLaneAttention(
  onAttention: (conversation: string, kind: AttentionKind) => void,
): LaneBadges {
  const [badges, setBadges] = useState<LaneBadges>(new Map());
  const alert = useRef(onAttention);
  alert.current = onAttention;
  const seen = useRef(new Map<string, AttentionKind | null>());

  useEffect(() => {
    const base = agentBaseUrl();
    if (base === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async (): Promise<void> => {
      const next = keyed(await fetchLanes(base));
      if (stopped) return;
      for (const [chat, row] of next) {
        const before = seen.current.get(chat) ?? null;
        if (row.attention !== null && before !== row.attention) {
          alert.current(chat, row.attention);
        }
        seen.current.set(chat, row.attention);
      }
      setBadges((held) => (same(held, next) ? held : next));
    };
    const loop = (): void => {
      void tick().finally(() => {
        if (!stopped) timer = setTimeout(loop, LANE_POLL_MS);
      });
    };
    loop();
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  return badges;
}
