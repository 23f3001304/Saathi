/**
 * One counter for every lane's hub.
 *
 * DECISION: epochs are process-unique, not hub-unique. Each conversation lane
 * runs its own `BeatHub`, and a hub that counted privately would mint `(4, 1)`
 * in two lanes at once — a client that switched chats mid-run could then read
 * a stranger's beat as one it had already seen, which is the cross-chat bleed
 * this whole layer exists to make structurally impossible. Seeded past the
 * highest epoch the durable log has ever held, so a restarted host never
 * reuses an address either (the same rule `wireBeatLog` keeps for one hub).
 */
export interface EpochSource {
  next(): number;
}

export class SharedEpochs implements EpochSource {
  private last: number;

  /** `lastEpoch` is the durable log's high-water mark, 0 for a fresh file. */
  constructor(lastEpoch: number) {
    this.last = lastEpoch;
  }

  next(): number {
    this.last += 1;
    return this.last;
  }
}
