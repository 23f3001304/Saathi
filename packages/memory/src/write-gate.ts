import type { Clock, EventSink, Tracer } from "@covenant/domain";
import { REASON_HUMAN, toIsoTimestamp } from "@covenant/domain";
import type { LedgerTransaction } from "@covenant/ledger";

import type { ChannelTierResolver } from "./channel-tier-resolver.js";
import type { LlmContradictionJudge } from "./llm-contradiction-judge.js";
import type { MemoryReadSide } from "./memory-ports.js";
import type { RuleChain } from "./rule-chain.js";
import type { RuleContext } from "./rules/contradiction-rule.js";
import type { TierPermissionRule } from "./rules/tier-permission-rule.js";
import type { VecIndex } from "./vec-index.js";
import type { Pending, WriteCommitter } from "./write-committer.js";
import { beatenBy } from "./write-committer.js";
import type {
  GrantedProvenance,
  MemoryWriteCandidate,
  MemoryWriteResult,
} from "./write-candidate.js";
import { supersedeKeyOf } from "./write-candidate.js";
import type { WriteRejection } from "./write-events.js";
import { rejectedDraft, toPassFor } from "./write-events.js";

/**
 * The four stages of §9.1, ordered cheapest-and-most-decisive first: the first
 * failure ends the write and is ledgered with its rule id. Three independent
 * gates reject the T-1 payload of §7.2, because the point of the demo is that
 * the defence is structural rather than a lucky regex.
 *
 * DECISION: stage 1's signature check, the embedding and stage 3's judge are
 * awaited *before* `BEGIN IMMEDIATE`; only stages 2 and 4 run inside it. Why:
 * `MandateVerifier`, `Embedder` and `PromptJudge` are all async and §5.3
 * forbids an `await` inside a transaction. The reads that feed them carry the
 * single-writer marker, so nothing can interleave before the commit.
 */
export class WriteGate {
  constructor(
    private readonly resolver: ChannelTierResolver,
    private readonly tierPermission: TierPermissionRule,
    private readonly chain: RuleChain,
    private readonly judge: LlmContradictionJudge | null,
    private readonly reader: MemoryReadSide,
    private readonly committer: WriteCommitter,
    private readonly vec: VecIndex,
    private readonly sink: EventSink,
    private readonly txn: LedgerTransaction,
    private readonly clock: Clock,
    private readonly tracer: Tracer,
  ) {}

  async submit(candidate: MemoryWriteCandidate): Promise<MemoryWriteResult> {
    const span = this.tracer.startSpan("memory.write_gate", {
      "covenant.memory.type": candidate.type,
      "covenant.memory.channel": candidate.sourceChannel,
    });
    try {
      return await this.run(candidate);
    } finally {
      span.setStatus("ok");
      span.end();
    }
  }

  private async run(
    candidate: MemoryWriteCandidate,
  ): Promise<MemoryWriteResult> {
    const resolution = await this.resolver.resolve(candidate);
    if (!resolution.ok) {
      return this.rejectWrite(candidate, null, {
        reasonCode: resolution.reasonCode,
        rule: null,
        attackId: null,
        telemetry: null,
      });
    }
    const pending = this.prepare(candidate, resolution.granted);
    const rejection = await this.screen(pending.context);
    if (rejection !== null) {
      return this.rejectWrite(candidate, pending.granted, rejection);
    }
    const embedding = await this.vec.embed(textOf(candidate));
    return this.txn.run("memory.write", () =>
      this.committer.commit(pending, embedding),
    );
  }

  // SINGLE-WRITER ASSUMPTION
  private prepare(
    candidate: MemoryWriteCandidate,
    granted: GrantedProvenance,
  ): Pending {
    const now = toIsoTimestamp(this.clock.now());
    // Episodes are transcripts: append-only, so they hold no supersede key.
    const key = candidate.type === "episode" ? null : supersedeKeyOf(candidate);
    const live = key === null ? [] : this.reader.liveOnKey(key);
    return {
      candidate,
      granted,
      now,
      key,
      live,
      context: {
        candidate,
        grantedTier: granted.tier,
        constraints: this.reader.liveConstraints(
          candidate.tenantId,
          candidate.userId,
        ),
        supersedes: live.filter((entry) => beatenBy(entry, granted.tier, now)),
      },
    };
  }

  /** Stage 2, then stage 3's deterministic chain, then the R6 fallback. */
  private async screen(context: RuleContext): Promise<WriteRejection | null> {
    const permission = this.tierPermission.evaluate(context);
    if (permission.verdict === "reject") {
      return {
        reasonCode: permission.reasonCode,
        rule: this.tierPermission.id,
        attackId: permission.attackId,
        telemetry: null,
      };
    }
    const chained = this.chain.run(context);
    if (chained.outcome.verdict === "reject") {
      return {
        reasonCode: chained.outcome.reasonCode,
        rule: chained.rule,
        attackId: chained.attackId,
        telemetry: null,
      };
    }
    return await this.consult(context);
  }

  private async consult(context: RuleContext): Promise<WriteRejection | null> {
    if (this.judge === null || !this.judge.fallbackApplies(context)) {
      return null;
    }
    const verdict = await this.judge.evaluate(context);
    if (verdict.outcome.verdict !== "reject") {
      return null;
    }
    return {
      reasonCode: verdict.outcome.reasonCode,
      rule: verdict.rule,
      attackId: verdict.outcome.attackId,
      telemetry: verdict.telemetry,
    };
  }

  /** A rejection is still a ledger event; no side effect escapes unrecorded. */
  private rejectWrite(
    candidate: MemoryWriteCandidate,
    granted: GrantedProvenance | null,
    rejection: WriteRejection,
  ): MemoryWriteResult {
    const event = this.txn.run("memory.write.rejected", () =>
      this.sink.append(rejectedDraft(candidate, granted, rejection)),
    );
    return {
      status: "rejected",
      memoryId: null,
      tierGranted: granted === null ? null : granted.tier,
      deduped: false,
      superseded: [],
      reasonCode: rejection.reasonCode,
      human: REASON_HUMAN[rejection.reasonCode],
      toPass: toPassFor(candidate, granted, rejection),
      rule: rejection.rule,
      eventId: event.id,
    };
  }
}

function textOf(candidate: MemoryWriteCandidate): string {
  const { subject, predicate, content } = candidate;
  return `${subject ?? ""} ${predicate ?? ""} ${JSON.stringify(content)}`;
}
