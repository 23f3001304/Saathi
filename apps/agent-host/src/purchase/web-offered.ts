import type { WebListingView } from "../browser/web-listing.js";

/**
 * The cards currently on the table.
 *
 * DECISION: written by the shell, from what it actually carded, and never by
 * the model. It is what makes "go with the Crucial E100" the same act as
 * tapping that card — the sentence is matched against the listings this host
 * chose to show, not against anything the model remembers offering.
 *
 * DECISION: it survives the run that produced it and is replaced only by the
 * next set. A pick usually arrives on the turn *after* the one that offered,
 * which is precisely when a run-scoped record would already be gone.
 *
 * DECISION: and it belongs to one conversation. The stamp is taken at the
 * start of every run, exactly as `WindowOwner` stamps a window — without it
 * one chat's cards would answer another chat's sentence, which is the same
 * cross-conversation leak the errand session had. A chat that never offered
 * anything sees nothing, whatever some other chat is holding.
 */
export class WebOffered {
  private rows: readonly WebListingView[] = [];
  private chat: string | null = null;
  private claimed: string | null = null;

  /** The conversation this run belongs to; taken before anything is offered. */
  claim(conversation: string | null): void {
    this.claimed = conversation;
  }

  live(conversation: string | null): readonly WebListingView[] {
    return conversation === this.chat ? this.rows : [];
  }

  /** The table as the run that claimed it sees it: what `see_state` reports
   *  as "on their screen" is exactly what a named ref resolves against. */
  current(): readonly WebListingView[] {
    return this.live(this.claimed);
  }

  offer(rows: readonly WebListingView[]): void {
    this.rows = rows;
    this.chat = this.claimed;
  }
}
