import type { MemoryEntry } from "@covenant/domain";
import { tierLabel } from "@covenant/domain";
import type { MemoryWriteRequest, MemoryWriteResponse } from "@covenant/gateway";
import type { MemoryEntryView, MemoryRetrieval, MemoryWriteResult } from "@covenant/memory";

/** The wire tier is the label `"P0".."P3"`, never the integer rank (§4.3). */
export function viewOf(entry: MemoryEntryView): Readonly<Record<string, unknown>> {
  return {
    id: entry.id,
    type: entry.type,
    tier: tierLabel(entry.tier),
    quarantined: entry.quarantined,
    subject: entry.subject,
    predicate: entry.predicate,
    content: entry.content,
    hash: entry.hash,
    source_channel: entry.sourceChannel,
    t_valid: entry.tValid,
    t_invalid: entry.tInvalid,
    t_created: entry.tCreated,
    t_expired: entry.tExpired,
    decay_weight: entry.decayWeight,
    score: entry.score,
  };
}

/**
 * `GET /memory` browses and does not score: `decay_weight` and `score` exist
 * on the view because a *retrieval* produces them, and a browse that invented
 * plausible numbers for them would be reporting a ranking it never ran.
 */
export function browseViewOf(
  entry: MemoryEntry,
): Readonly<Record<string, unknown>> {
  return {
    id: entry.id,
    type: entry.type,
    tier: tierLabel(entry.tier),
    quarantined: entry.quarantined,
    subject: entry.subject,
    predicate: entry.predicate,
    content: entry.content,
    hash: entry.entryHash,
    source_channel: entry.sourceChannel,
    t_valid: entry.tValid,
    t_invalid: entry.tInvalid,
    t_created: entry.tCreated,
    t_expired: entry.tExpired,
    decay_weight: 1,
    score: 0,
  };
}

export function retrievalBodyOf(
  retrieval: MemoryRetrieval,
): Readonly<Record<string, unknown>> {
  return {
    ok: true,
    action_class: retrieval.actionClass,
    entries: retrieval.entries.map(viewOf),
    digest: retrieval.digest,
    digest_alg: retrieval.digestAlg,
    tier_floor: tierLabel(retrieval.tierFloor),
  };
}

export function writeBodyOf(result: MemoryWriteResult): MemoryWriteResponse {
  return {
    ok: true,
    status: result.status,
    memory_id: result.memoryId,
    tier_granted:
      result.tierGranted === null ? null : tierLabel(result.tierGranted),
    deduped: result.deduped,
    superseded: [...result.superseded],
    reason_code: result.reasonCode,
    human: result.human,
    to_pass: result.toPass === null ? null : { ...result.toPass },
    rule: result.rule,
    event_id: result.eventId,
  };
}

export function candidateOf(
  body: MemoryWriteRequest,
  tierClaim: number,
  requestId: string,
) {
  return {
    tenantId: body.tenant_id,
    userId: body.user_id,
    type: body.type,
    tierClaim: tierClaim as 0 | 1 | 2 | 3,
    content: body.content,
    sourceChannel: body.source_channel,
    sourceRef: body.source_ref,
    sig: body.sig,
    subject: body.subject,
    predicate: body.predicate,
    tValid: body.t_valid,
    tInvalid: body.t_invalid,
    requestId,
  };
}
