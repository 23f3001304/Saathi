import type {
  EventSink,
  IdGenerator,
  IsoTimestamp,
  MemoryEntry,
  MemoryWriteStatus,
  Tier,
} from "@covenant/domain";
import { tierPermittedToSupersede } from "@covenant/domain";

import { entryHashOf } from "./memory-digest.js";
import type { MemoryReadSide, MemoryWriteSide } from "./memory-ports.js";
import { contentHashOf } from "./memory-row.js";
import type { RuleContext } from "./rules/contradiction-rule.js";
import type {
  GrantedProvenance,
  MemoryWriteCandidate,
  MemoryWriteResult,
  SupersedeKey,
} from "./write-candidate.js";
import {
  committedDraft,
  dedupedDraft,
  supersededDraft,
} from "./write-events.js";

/** Everything stages 2–4 share, read once so one write sees one instant. */
export interface Pending {
  readonly candidate: MemoryWriteCandidate;
  readonly granted: GrantedProvenance;
  readonly now: IsoTimestamp;
  readonly key: SupersedeKey | null;
  readonly live: readonly MemoryEntry[];
  readonly context: RuleContext;
}

/**
 * DECISION: §9.1 stage 4 is its own class rather than four more methods on
 * `WriteGate`. Why: the gate at 340 lines was over the 200-line limit, and the
 * seam is real — stages 1–3 decide, stage 4 is the only part that runs inside
 * `BEGIN IMMEDIATE` and the only part that writes.
 */
export class WriteCommitter {
  constructor(
    private readonly reader: MemoryReadSide,
    private readonly writer: MemoryWriteSide,
    private readonly sink: EventSink,
    private readonly ids: IdGenerator,
  ) {}

  commit(pending: Pending, embedding: Float32Array | null): MemoryWriteResult {
    const deduped = this.dedupe(pending);
    if (deduped !== null) {
      return deduped;
    }
    const shadowed = pending.live.length > pending.context.supersedes.length;
    const draft = this.entryFor(pending);
    const event = this.sink.append(
      committedDraft(pending.candidate, draft, shadowed),
    );
    const stored: MemoryEntry = { ...draft, writeEventId: event.id };
    this.writer.put(stored, embedding);
    return {
      status: statusOf(pending.granted, shadowed),
      memoryId: stored.id,
      tierGranted: stored.tier,
      deduped: false,
      superseded: this.supersede(pending, stored),
      reasonCode: null,
      human: null,
      toPass: null,
      rule: null,
      eventId: event.id,
    };
  }

  /** 4a: an identical live fact re-observed is the existing id, not a new row. */
  private dedupe(pending: Pending): MemoryWriteResult | null {
    const { key, candidate, granted } = pending;
    const existing =
      key === null
        ? null
        : this.reader.liveByContentHash(key, contentHashOf(candidate.content));
    if (existing === null) {
      return null;
    }
    return {
      status: "committed",
      memoryId: existing.id,
      tierGranted: granted.tier,
      deduped: true,
      superseded: [],
      reasonCode: null,
      human: null,
      toPass: null,
      rule: null,
      eventId: this.sink.append(dedupedDraft(candidate, existing)).id,
    };
  }

  /** 4b: the guarded UPDATE of §5.2 f, then its own ledger event. */
  private supersede(pending: Pending, stored: MemoryEntry): readonly string[] {
    const { key, candidate, granted, now } = pending;
    if (
      key === null ||
      !tierPermittedToSupersede(candidate.type, granted.tier)
    ) {
      return [];
    }
    const ids = this.writer.supersede(key, {
      newId: stored.id,
      newTier: stored.tier,
      newTCreated: stored.tCreated,
      now,
    });
    if (ids.length > 0) {
      this.sink.append(supersededDraft(candidate, stored.id, ids, now));
    }
    return ids;
  }

  /** `writeEventId` is assigned by the append and is deliberately outside the
   *  `covenant-md-1` field list (§9.4), so the hash is stable across it. */
  private entryFor(pending: Pending): MemoryEntry {
    const { candidate, granted, now } = pending;
    const draft: MemoryEntry = {
      id: `mem_${this.ids.uuid()}`,
      tenantId: candidate.tenantId,
      userId: candidate.userId,
      type: candidate.type,
      tier: granted.tier,
      quarantined: granted.quarantined,
      subject: candidate.subject,
      predicate: candidate.predicate,
      content: candidate.content,
      contentHash: contentHashOf(candidate.content),
      entryHash: "",
      sourceChannel: candidate.sourceChannel,
      sourceRef: candidate.sourceRef ?? granted.signerRef,
      tValid: candidate.tValid,
      tInvalid: candidate.tInvalid,
      tCreated: now,
      tExpired: null,
      supersededBy: null,
      writeEventId: "",
    };
    return { ...draft, entryHash: entryHashOf(draft) };
  }
}

/** Mirrors the guarded UPDATE: higher tier wins, equal tier → later write. */
export function beatenBy(
  entry: MemoryEntry,
  newTier: Tier,
  newTCreated: IsoTimestamp,
): boolean {
  if (entry.tier < newTier) {
    return true;
  }
  return (
    entry.tier === newTier &&
    Date.parse(entry.tCreated) <= Date.parse(newTCreated)
  );
}

/**
 * DECISION: `quarantined` outranks `shadowed` in the §4.4 status enum. Why:
 * being excluded from every action class but `chat` is the more consequential
 * fact for the caller, and the shadowing is still visible in the ledger's
 * `memory.write.shadowed` and in the entry's own tier.
 */
function statusOf(
  granted: GrantedProvenance,
  shadowed: boolean,
): MemoryWriteStatus {
  if (granted.quarantined) {
    return "quarantined";
  }
  return shadowed ? "shadowed" : "committed";
}
