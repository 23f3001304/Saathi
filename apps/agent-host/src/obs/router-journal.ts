import type { RouterAudit, RoutingDecision } from "@covenant/agents";
import type { Clock, IdGenerator, Logger } from "@covenant/domain";
import { GENESIS_HASH, canonicalize, sha256Hex } from "@covenant/domain";

export interface RoutingEntry {
  readonly id: string;
  readonly ts: string;
  readonly seq: number;
  readonly decision: RoutingDecision;
  readonly prev_hash: string;
  readonly this_hash: string;
}

/**
 * The routing channel of the decision journal.
 *
 * DECISION: routing decisions get their own chain rather than an entry in
 * `DecisionJournal`. `EventKind` is a closed taxonomy owned by
 * `@covenant/domain` and read by the audit UI as its own vocabulary; "which
 * model answered" is not a ledger fact about money and does not belong in it.
 * It is still hash-chained, timestamped and sequenced exactly like the F2
 * journal, because the standard is the same: the router is hidden from the
 * user, never from the record, and a record that cannot be shown to be intact
 * is not a record.
 *
 * What lands here is the whole decision — candidates considered, class
 * assigned, model chosen, the confidence score with each component signal and
 * its weight, and every escalation with the reason it fired.
 */
export class RouterJournal implements RouterAudit {
  private readonly entries: RoutingEntry[] = [];

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly logger: Logger,
  ) {}

  record(decision: RoutingDecision): void {
    const seq = this.entries.length + 1;
    const prev = this.head();
    const entry: RoutingEntry = {
      id: `urn:uuid:${this.ids.uuid()}`,
      ts: this.clock.now().toISOString(),
      seq,
      decision,
      prev_hash: prev,
      this_hash: sha256Hex(`${prev}\n${canonicalize({ seq, ...decision })}`),
    };
    this.entries.push(entry);
    this.log(entry);
  }

  all(): readonly RoutingEntry[] {
    return this.entries;
  }

  private head(): string {
    return this.entries[this.entries.length - 1]?.this_hash ?? GENESIS_HASH;
  }

  /** `info`, not `debug`: an escalation is a cost the operator should be able
   *  to find in the logs without turning the level up after the fact. */
  private log(entry: RoutingEntry): void {
    const { decision } = entry;
    this.logger.info("router.decision", {
      seq: entry.seq,
      task_class: decision.taskClass,
      chosen: decision.chosen,
      candidates: decision.candidates.join(","),
      escalations: decision.escalations,
      capped: decision.capped,
      confidence: confidenceOf(decision),
    });
  }
}

function confidenceOf(decision: RoutingDecision): number {
  const chosen = decision.attempts.find(
    (attempt) => `${attempt.provider}:${attempt.model}` === decision.chosen,
  );
  return chosen?.confidence ?? 0;
}
