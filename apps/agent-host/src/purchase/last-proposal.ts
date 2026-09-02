import type { ConversationResult } from "@covenant/agents";

import type { SignedIntent } from "./intent-flow.js";

/**
 * What the run's one proposed cart was built from, held so a tapped card can
 * rebuild it for a different listing.
 *
 * DECISION: repropose, never re-run. The platform flow pre-builds its cart
 * and then presents the options, so a tap on any card but the cart's own was
 * a signature over a different thing than the sheet implied: the bill said
 * ₹1,410 (Nilgiri) while the signed cart held the ₹1,199 default. Parking
 * the run at the pick would have fixed it too, but it changes the contract
 * every headless driver relies on; holding the makings and rebuilding the
 * cart on demand fixes the lie without moving the flow.
 */
export interface HeldProposal {
  readonly intent: SignedIntent;
  readonly conversation: ConversationResult;
  /** The sku the standing cart was built for; a tap on it is a no-op. */
  readonly sku: string;
}

export class LastProposal {
  private held: HeldProposal | null = null;

  hold(proposal: HeldProposal): void {
    this.held = proposal;
  }

  current(): HeldProposal | null {
    return this.held;
  }

  /** A new run's proposal is a new fact; the old makings must not leak. */
  clear(): void {
    this.held = null;
  }
}
