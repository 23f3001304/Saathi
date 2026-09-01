import type { Draft, DraftScope, DraftSink } from "./turn-stream.js";
import { SILENT_DRAFT } from "./turn-stream.js";

/** What the shopper is told when a rung is escalated past. */
export const ESCALATED_AWAY =
  "the agent was not confident enough in that answer to stand behind it";

/**
 * Every draft one model attempt opened, in order.
 *
 * A cascade may run two models before it says which answer it is keeping, and
 * one attempt may take several round trips to produce that answer. This is the
 * bookkeeping that lets the router take a whole discarded attempt back off the
 * screen by name, rather than leaving a rung that was escalated past standing
 * as though it had been the answer.
 */
export class DraftGroup implements DraftScope {
  private opened: Draft[] = [];

  constructor(private readonly sink: DraftSink | null) {}

  open(): Draft {
    const draft = this.sink?.open();
    if (draft === undefined) {
      return SILENT_DRAFT;
    }
    this.opened.push(draft);
    return draft;
  }

  /**
   * Withdraws every draft this attempt wrote, settled or not — the router
   * judges after the round trips have finished, so an answer it discards has
   * usually already been settled by the loop that produced it.
   */
  withdrawAll(reason: string): void {
    const held = this.opened;
    this.opened = [];
    for (const draft of held) {
      draft.withdraw(reason);
    }
  }

  /** The attempt was kept: its drafts stand as the loop settled them, and are
   *  released so a long conversation does not accumulate them. */
  release(): void {
    this.opened = [];
  }
}
