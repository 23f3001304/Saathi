import type { ConversationResult } from "@covenant/agents";
import type { StoredEvent } from "@covenant/domain";

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
  ) {}

  /**
   * `held` is a line another beat is about to carry — the question a parked
   * turn ends on, which goes out as a `question` beat, not as a bubble.
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
   * The listings are whatever the model's own `catalog_search` query pulled.
   * DECISION: nothing here re-judges them. The overlap filter that stood
   * here dropped rows whose words the shopper had not typed, and on the
   * demo's own kurta run it emptied the set and lost the flagship path its
   * cards. The model chose the query with the conversation in front of it;
   * a token comparison has less.
   */
  present(): void {
    const shown = this.log.listings;
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
