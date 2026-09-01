import type {
  EventDraft,
  IsoTimestamp,
  MemoryEntry,
  MemoryWriteToPass,
  ReasonCode,
  Tier,
} from "@covenant/domain";
import { MIN_TIER_TO_CREATE, REASON_HUMAN, tierLabel } from "@covenant/domain";

import type { MemoryRowDraft } from "./memory-row.js";
import { toRowDraft } from "./memory-row.js";
import type {
  GrantedProvenance,
  MemoryWriteCandidate,
} from "./write-candidate.js";
import { contentExcerpt } from "./write-candidate.js";

export interface WriteRejection {
  readonly reasonCode: ReasonCode;
  readonly rule: string | null;
  readonly attackId: string | null;
  readonly telemetry: Readonly<Record<string, unknown>> | null;
}

function base(
  candidate: MemoryWriteCandidate,
  kind: EventDraft["kind"],
  payload: EventDraft["payload"],
): EventDraft {
  return {
    tenant_id: candidate.tenantId,
    actor: "gateway",
    kind,
    txn_id: null,
    request_id: candidate.requestId,
    mandate_id: candidate.sourceRef,
    payload,
  };
}

/**
 * DECISION: `memory.write.committed` carries the whole row under `entry`,
 * beyond §10.3's headline fields. Why: §3.10 requires `memory` to rebuild from
 * `seq = 1` through `MemoryProjection`, and a payload of `{memory_id, type,
 * tier, source_channel, entry_hash}` cannot reconstruct a row. `write_event_id`
 * is *not* in the payload — the projection fills it from `event.id`, which is
 * the only value that is guaranteed to agree with the live write.
 */
export function committedDraft(
  candidate: MemoryWriteCandidate,
  entry: MemoryEntry,
  shadowed: boolean,
): EventDraft {
  const row: MemoryRowDraft = toRowDraft(entry);
  return base(
    candidate,
    shadowed ? "memory.write.shadowed" : "memory.write.committed",
    {
      memory_id: entry.id,
      type: entry.type,
      tier: entry.tier,
      source_channel: entry.sourceChannel,
      entry_hash: entry.entryHash,
      quarantined: entry.quarantined,
      deduped: false,
      shadowed,
      entry: row,
    },
  );
}

/** The no-op payload of §5.2 f: an identical live fact re-observed. */
export function dedupedDraft(
  candidate: MemoryWriteCandidate,
  existing: MemoryEntry,
): EventDraft {
  return base(candidate, "memory.write.committed", {
    memory_id: existing.id,
    type: existing.type,
    tier: existing.tier,
    source_channel: existing.sourceChannel,
    entry_hash: existing.entryHash,
    deduped: true,
  });
}

export function supersededDraft(
  candidate: MemoryWriteCandidate,
  memoryId: string,
  supersededIds: readonly string[],
  tExpired: IsoTimestamp,
): EventDraft {
  return base(candidate, "memory.write.superseded", {
    memory_id: memoryId,
    superseded_ids: supersededIds,
    t_expired: tExpired,
  });
}

/**
 * `attack_id` rides here rather than on a separate `attack.detected`:
 * §10.3 emits that kind **only** for blocks not already visible as a
 * `memory.write.rejected` (decision 24), and `ATTACK_DETECTED_SOURCES` lists
 * no memory-write source. One block, one crimson event.
 */
export function rejectedDraft(
  candidate: MemoryWriteCandidate,
  granted: GrantedProvenance | null,
  rejection: WriteRejection,
): EventDraft {
  return base(candidate, "memory.write.rejected", {
    reason_code: rejection.reasonCode,
    rule: rejection.rule,
    human: REASON_HUMAN[rejection.reasonCode],
    attack_id: rejection.attackId,
    content_excerpt: contentExcerpt(candidate.content),
    type: candidate.type,
    source_channel: candidate.sourceChannel,
    tier_granted: granted === null ? null : granted.tier,
    judge: rejection.telemetry,
  });
}

/**
 * DECISION: the remedy is `obtain_signed_attestation`, not §9.5's
 * `obtain_user_confirmation`. Why: `REMEDIES` is a frozen `domain` enum with
 * no such member, and the two say the same thing — re-present the write over a
 * channel that carries a signature.
 */
export function toPassFor(
  candidate: MemoryWriteCandidate,
  granted: GrantedProvenance | null,
  rejection: WriteRejection,
): MemoryWriteToPass {
  const grantedTier: Tier = granted?.tier ?? 0;
  return {
    claimed_tier:
      candidate.tierClaim === null ? null : tierLabel(candidate.tierClaim),
    granted_tier: tierLabel(grantedTier),
    required_tier: tierLabel(requiredTier(candidate, rejection)),
    rule: rejection.rule,
    remedy: "obtain_signed_attestation",
  };
}

/** P3 is the tier that would have made any contradiction rejection legal. */
function requiredTier(
  candidate: MemoryWriteCandidate,
  rejection: WriteRejection,
): Tier {
  return rejection.reasonCode === "TYPE_REQUIRES_HIGHER_TIER"
    ? MIN_TIER_TO_CREATE[candidate.type]
    : 3;
}
