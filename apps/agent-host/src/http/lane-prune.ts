/** The slice of a lane this pruning reads. Structural on purpose: naming
 *  `ChatLane` here put this file inside chat-lanes' own import cycle, and
 *  pruning needs two facts, not the lane. */
export interface PrunableLane {
  readonly chat: { readonly busy: boolean };
  close(): Promise<void> | void;
}

/** More held lanes than any shelf of chats plausibly shows at once. */
export const MAX_HELD_LANES = 32;

/**
 * A lane object is cheap, but "cheap" times "every conversation id a caller
 * ever names" is a leak: the scoped wire builds a lane for any id it is asked
 * about, so an abusive or merely long-lived client would grow the map without
 * bound. Past the ceiling, the oldest idle lane is let go — never the default
 * lane (the CLI's), never one mid-run. A retired conversation loses nothing
 * durable: its beats and working context are in the logs, and its next
 * message builds a fresh lane that rehydrates from them.
 */
export function pruneLanes(
  lanes: Map<string, PrunableLane>,
  max: number = MAX_HELD_LANES,
): void {
  if (lanes.size <= max) return;
  for (const [key, lane] of lanes) {
    if (key === "" || lane.chat.busy) continue;
    lanes.delete(key);
    void lane.close();
    return;
  }
}
