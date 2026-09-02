import type { DraftFields } from "@covenant/agents";

/**
 * The draft the planner's `propose_purchase` call carried, held for the length
 * of one run so the judge that drafts the sheet can read it.
 *
 * DECISION: a holder rather than an argument threaded through `IntentFlow`.
 * `IntentFlow.sign(conversation)` is the seam every headless driver and the
 * scripted demo rely on, and the scripted judge reads the conversation, not
 * a draft. Holding the draft beside `LastProposal` keeps that seam intact and
 * lets one judge per mode read what it needs.
 */
export class PendingDraft {
  private held: DraftFields | null = null;

  hold(draft: DraftFields): void {
    this.held = draft;
  }

  current(): DraftFields | null {
    return this.held;
  }

  /** A new run's proposal is a new fact; the old draft must not leak. */
  clear(): void {
    this.held = null;
  }
}
