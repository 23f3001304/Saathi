import type {
  ActionClass,
  Clock,
  EventSink,
  IsoTimestamp,
  MemoryContent,
  MemorySearchQuery,
  Sha256Hex,
  Sha256Ref,
  Tier,
  Tracer,
} from "@covenant/domain";
import { ACTION_POLICY, MEMORY_DIGEST_ALG } from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import type { MemoryDigest } from "./memory-digest.js";
import type { MemoryRetriever } from "./memory-ports.js";
import type { RetrievalScorer, ScoredEntry } from "./retrieval-scorer.js";

/** `memoryEntryView` of §4.4, minus the wire tier label the HTTP layer maps. */
export interface MemoryEntryView {
  readonly id: string;
  readonly type: string;
  readonly tier: Tier;
  readonly quarantined: boolean;
  readonly subject: string | null;
  readonly predicate: string | null;
  readonly content: MemoryContent;
  readonly hash: Sha256Hex;
  readonly sourceChannel: string;
  readonly tValid: IsoTimestamp;
  readonly tInvalid: IsoTimestamp | null;
  readonly tCreated: IsoTimestamp;
  readonly tExpired: IsoTimestamp | null;
  readonly decayWeight: number;
  readonly score: number;
}

export interface MemoryRetrieval {
  readonly actionClass: ActionClass;
  readonly entries: readonly MemoryEntryView[];
  /** `null` for the action classes with `mintsDigest: false` (§9.3). */
  readonly digest: Sha256Ref | null;
  readonly digestAlg: typeof MEMORY_DIGEST_ALG;
  readonly tierFloor: Tier;
  readonly eventId: string;
}

/**
 * Applies the action-class policy of §9.3, scores, truncates, emits
 * `memory.retrieved` and returns the entries with their digest. What a
 * retrieval is *for* decides what it may see: `cart-construction` never sees a
 * quarantined row, and `constraint-evaluation` sees constraints at full weight
 * because a decayed constraint is one that quietly stops binding (decision 40).
 *
 * DECISION: `LedgerTransaction` joins §2.2's collaborator list. Why: the
 * `memory.retrieved` append is a ledger write, and §4.11 publishes its SSE
 * frame only in `afterCommit` — without the envelope the frame never flushes.
 * The search is awaited *before* the transaction opens, because §5.3 forbids
 * an `await` inside `BEGIN IMMEDIATE`.
 */
export class ReadGate {
  constructor(
    private readonly retriever: MemoryRetriever,
    private readonly scorer: RetrievalScorer,
    private readonly digest: MemoryDigest,
    private readonly sink: EventSink,
    private readonly txn: LedgerTransaction,
    private readonly clock: Clock,
    private readonly tracer: Tracer,
  ) {}

  async retrieve(query: MemorySearchQuery): Promise<MemoryRetrieval> {
    const policy = ACTION_POLICY[query.actionClass];
    const span = this.tracer.startSpan("memory.read_gate", {
      "covenant.memory.action_class": query.actionClass,
      "covenant.memory.tier_floor": policy.tierFloor,
    });
    try {
      const ranked = await this.rank(query);
      return this.publish(query, ranked);
    } finally {
      span.setStatus("ok");
      span.end();
    }
  }

  private async rank(
    query: MemorySearchQuery,
  ): Promise<readonly ScoredEntry[]> {
    const policy = ACTION_POLICY[query.actionClass];
    const candidates = await this.retriever.retrieve(query);
    const ranked = this.scorer.rank(candidates, policy.decayApplied);
    return ranked.slice(0, query.limit);
  }

  private publish(
    query: MemorySearchQuery,
    ranked: readonly ScoredEntry[],
  ): MemoryRetrieval {
    const policy = ACTION_POLICY[query.actionClass];
    const entries = ranked.map((scored) => this.viewOf(scored));
    const digest = policy.mintsDigest
      ? this.digest.compute(ranked.map((scored) => scored.entry))
      : null;
    const eventId = this.txn.run("memory.retrieve", () =>
      this.append(query, entries, digest),
    );
    return {
      actionClass: query.actionClass,
      entries,
      digest,
      digestAlg: MEMORY_DIGEST_ALG,
      tierFloor: policy.tierFloor,
      eventId,
    };
  }

  private append(
    query: MemorySearchQuery,
    entries: readonly MemoryEntryView[],
    digest: Sha256Ref | null,
  ): string {
    return this.sink.append({
      tenant_id: query.tenantId,
      actor: "gateway",
      kind: "memory.retrieved",
      txn_id: null,
      request_id: null,
      mandate_id: null,
      payload: {
        action_class: query.actionClass,
        entry_ids: entries.map((entry) => entry.id),
        digest,
        digest_alg: MEMORY_DIGEST_ALG,
        tier_floor: ACTION_POLICY[query.actionClass].tierFloor,
        retrieved_at: this.clock.now().toISOString(),
      },
    }).id;
  }

  /** `hash` is recomputed, not the stored column: §9.4 rule 5 wants the two
   *  digest computations to be independent reads of the same store. */
  private viewOf(scored: ScoredEntry): MemoryEntryView {
    const { entry } = scored;
    return {
      id: entry.id,
      type: entry.type,
      tier: entry.tier,
      quarantined: entry.quarantined,
      subject: entry.subject,
      predicate: entry.predicate,
      content: entry.content,
      hash: this.digest.entryHash(entry),
      sourceChannel: entry.sourceChannel,
      tValid: entry.tValid,
      tInvalid: entry.tInvalid,
      tCreated: entry.tCreated,
      tExpired: entry.tExpired,
      decayWeight: scored.decayWeight,
      score: scored.score,
    };
  }
}

/** §9.3's per-class default; `null` is `recs-training`'s unbounded fold. */
export function defaultLimitFor(actionClass: ActionClass): number | null {
  return ACTION_POLICY[actionClass].defaultLimit;
}
