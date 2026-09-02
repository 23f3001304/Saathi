import type { CatalogListing, ConversationResult } from "@covenant/agents";
import type { Logger, StoredEvent } from "@covenant/domain";

import { requestOverlap } from "../judge/catalog-match.js";

import type { BeatHub } from "../http/beat-hub.js";
import type { DecisionJournal } from "../obs/decision-journal.js";
import { isProse } from "./prose.js";
import {
  optionRowsOf,
  presentListings,
  sortKeyReason,
} from "./presentation.js";
import type { ToolLog } from "./tool-log.js";

function str(event: StoredEvent, key: string, fallback: string): string {
  const value = event.payload[key];
  return typeof value === "string" ? value : fallback;
}

/**
 * Turns what the run *did* into what the conversation pane *shows*. It is a
 * projection and nothing else: every beat here is derived from the tool log,
 * the hook's journal or the conversation transcript, so the pane cannot show a
 * step that did not happen and cannot hide one that did.
 */
export class RunNarrator {
  constructor(
    private readonly hub: BeatHub,
    private readonly log: ToolLog,
    private readonly journal: DecisionJournal,
    private readonly logger: Logger | null = null,
  ) {}

  /**
   * `held` is a line another beat is about to carry — the question a parked
   * turn ends on, which goes out as a `question` beat, not as a bubble.
   *
   * This is the one path where the model has actually *seen* the listings: it
   * called `catalog_search` itself. So it is the one path that can read the
   * table back out — "Kolam Run Gc9 road shoe, UK 8 — ₹1,999; cushioned socks,
   * 3 pack — ₹499" — directly above the cards printing the same rows at the
   * same prices. That line is dropped rather than shown: the cards are the
   * presentation, nothing is lost by not saying it twice, and the sentences
   * around it stand.
   */
  replay(conversation: ConversationResult, held: string | null = null): void {
    // Every prose turn the model wrote goes out as it wrote it. The filters
    // that lived here (restated-row suppression, per-line language checks)
    // second-guessed output the prompt already shapes; what the shopper
    // reads is the model's, whole.
    for (const text of conversation.transcript.filter(isProse)) {
      if (text.trim() === held) continue;
      this.hub.emit({ kind: "message", text });
    }
    this.replayMemory();
    this.replayBlocked();
  }

  /**
   * The neutral-presentation beat pair: the sort key, then what it sorted.
   *
   * The listings are whatever the model's own `catalog_search` query pulled,
   * and its query is not the shopper's sentence — "navy kurta" once queried
   * broadly enough to present the stole beside it. What renders is re-checked
   * against the request: rows sharing no ground with what was actually asked
   * are dropped.
   *
   * DECISION: an empty survivor set presents nothing. The first cut kept the
   * whole set when the filter emptied it, reasoning that an unfamiliar word
   * was the model's judgement to keep — and an errand that wandered onto a
   * marketplace home page then carded the deals carousel, three girls'
   * dresses and a smartwatch under an SSD request, directly beneath prose
   * saying none of them fit. When nothing shown matches anything asked, the
   * honest presentation is the prose alone.
   */
  present(request = ""): void {
    const shown = this.requested(request);
    if (shown.length === 0) {
      return;
    }
    const presentation = presentListings(shown);
    this.hub.emit({
      kind: "sort-key",
      sortKey: presentation.sortKey,
      memoryId: "",
      label: sortKeyReason(),
    });
    this.hub.emit({ kind: "options", options: optionRowsOf(presentation) });
  }

  /**
   * What the model's own `catalog_search` pulled, re-checked against what was
   * actually asked for — rows sharing no ground with the request are dropped.
   *
   * DECISION: unless dropping would empty the set, in which case the model's
   * own choice stands. That was always the stated rule and the implementation
   * had drifted from it: on the demo's own kurta run the overlap came out
   * empty, `present` returned early, and the flagship path lost its sort-key
   * beat and its option cards together. An unfamiliar word is the model's
   * judgement to keep, not ours to blank the screen over — the *whole* set
   * being off-request is evidence about the matcher, not about the shelf.
   */
  private requested(request: string): readonly CatalogListing[] {
    if (request.trim() === "") return this.log.listings;
    const kept = requestedListings(this.log.listings, request);
    if (kept.length > 0) return kept;
    this.logger?.info("purchase.narrator.off_request", {
      dropped: this.log.listings.length,
    });
    return this.log.listings;
  }

  private replayMemory(): void {
    for (const write of this.log.memoryWrites) {
      this.hub.emit({
        kind: "memory",
        status: write.status,
        tierGranted: write.tierGranted,
        reasonCode: write.reasonCode,
        rule: write.rule,
        memoryId: write.memoryId,
      });
    }
  }

  /**
   * The block list comes from the hook's own journal rather than from
   * `ConversationResult.blocked`, which carries the decision without the call
   * it refused. "Something was blocked" is not a demo beat; "`execute_payment`
   * on `covenant_merchant` was blocked" is.
   */
  private replayBlocked(): void {
    for (const event of this.journal.ofKind("tool.call.blocked")) {
      this.hub.emit({
        kind: "blocked",
        tool: str(event, "tool", "unknown"),
        server: str(event, "server", "unknown"),
        reason: str(event, "reason", "blocked"),
        human: str(event, "human", "The call was refused before it ran."),
      });
    }
  }
}

export function requestedListings(
  listings: readonly CatalogListing[],
  request: string,
): readonly CatalogListing[] {
  return listings.filter(
    (row) => requestOverlap(`${row.label} ${row.category}`, request) > 0,
  );
}
