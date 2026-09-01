// The lane list, folded onto the shelf: one badge per chat the host has a
// row for. Its own module so the mapping is testable without mounting the
// whole shelf.
import type { AttentionKind } from "../api/lanes.ts";
import type { ChatSessionMeta, LaneBadgeView } from "./ChatHistory.tsx";
import type { LaneBadges } from "./useLaneAttention.ts";

export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  question: "needs an answer",
  pick: "needs a pick",
  sign: "needs your signature",
  handoff: "you have the wheel",
};

/** The ask if there is one, else the place in line, else that it is working:
 *  one badge, because a row wearing three reads as an alarm panel. */
export function badgesFor(
  sessions: readonly ChatSessionMeta[],
  lanes: LaneBadges,
): ReadonlyMap<number, LaneBadgeView> {
  const out = new Map<number, LaneBadgeView>();
  for (const session of sessions) {
    if (session.conversationId === null) continue;
    const row = lanes.get(session.conversationId);
    if (row === undefined) continue;
    if (row.attention !== null) {
      out.set(session.id, {
        label: ATTENTION_LABEL[row.attention],
        tone: "attention",
      });
    } else if (row.queued !== null) {
      out.set(session.id, { label: `in line, #${row.queued}`, tone: "queued" });
    } else if (row.running) {
      out.set(session.id, { label: "working", tone: "running" });
    }
  }
  return out;
}
