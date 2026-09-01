import type { Draft, DraftSink } from "@covenant/agents";
import { CoalescingStream } from "@covenant/agents";

import type { BeatHub } from "../http/beat-hub.js";

/**
 * A streamed answer, published as ordinary beats.
 *
 * DECISION: fragments go through `hub.emit` like every other beat rather than
 * down a side channel of their own. The hub already appends once and replays
 * by `(epoch, index)`, so a client that reconnects halfway through a sentence
 * gets exactly the fragments it missed and no others — the property is the
 * hub's, not a second mechanism that would have to agree with it. It also
 * means `GET /chat/state` and the socket carry the same account of what was
 * said, which is the whole reason the log exists.
 *
 * DECISION: nothing is emitted for a draft that never streamed. A provider on
 * the blocking path opens and closes drafts like any other; if no fragment
 * arrived, no beat is written, and the conversation reads exactly as it did
 * before streaming existed.
 */
class BeatDraft implements Draft {
  private streamed = false;
  private settled = false;
  private gone = false;
  private readonly coalescing: CoalescingStream;

  constructor(
    readonly id: string,
    private readonly hub: BeatHub,
  ) {
    this.coalescing = new CoalescingStream((text) => {
      this.streamed = true;
      this.hub.emit({ kind: "delta", streamId: this.id, text });
    });
  }

  delta(text: string): void {
    if (!this.settled && !this.gone) {
      this.coalescing.delta(text);
    }
  }

  settle(): void {
    if (this.settled || this.gone) {
      return;
    }
    this.coalescing.close();
    this.settled = true;
    if (this.streamed) {
      this.hub.emit({ kind: "draft-settled", streamId: this.id });
    }
  }

  /**
   * Withdrawal outranks settling, because the router judges an attempt only
   * after the loop that produced it has already settled its round trips. The
   * held tail is dropped rather than flushed: an answer being taken off the
   * screen does not get a last word on the way out.
   */
  withdraw(reason: string): void {
    if (this.gone) {
      return;
    }
    this.gone = true;
    if (this.streamed) {
      this.hub.emit({ kind: "draft-withdrawn", streamId: this.id, reason });
    }
  }
}

export class BeatDraftSink implements DraftSink {
  private opened = 0;
  private last: BeatDraft | null = null;

  constructor(private readonly hub: BeatHub) {}

  open(): Draft {
    this.opened += 1;
    this.last = new BeatDraft(`d${this.opened}`, this.hub);
    return this.last;
  }

  /**
   * Take the most recent streamed answer back off the screen.
   *
   * For the run that discovers, *after* the model has already said "your
   * purchase request is ready for you to review and sign", that this shop
   * stocks nothing of the kind. Two adjacent bubbles contradicting each other
   * is the worst of the three available outcomes; withdrawal is the one the
   * client already renders honestly, as "Withdrawn — <reason>".
   *
   * Withdrawal outranks settling (see `BeatDraft.withdraw`), and a draft that
   * never streamed emits nothing, so this is safe on every path.
   */
  withdrawLast(reason: string): void {
    this.last?.withdraw(reason);
    this.last = null;
  }
}
