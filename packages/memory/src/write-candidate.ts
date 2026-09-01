import type {
  IsoTimestamp,
  MemoryContent,
  MemoryType,
  MemoryWriteStatus,
  ReasonCode,
  SourceChannel,
  Tier,
  ToPass,
} from "@covenant/domain";

/**
 * DECISION: the write-gate value objects live in their own module rather than
 * beside `WriteGate`. Why: every rule in `rules/` needs `MemoryWriteCandidate`
 * and `WriteGate` needs every rule, so co-locating them would make a cycle
 * that `.dependency-cruiser.cjs`'s `no-circular` rule rejects.
 */
export interface MemoryWriteCandidate {
  readonly tenantId: string;
  readonly userId: string;
  readonly type: MemoryType;
  /** A CLAIM. Stage 1 derives the real tier from the channel (§9.1). */
  readonly tierClaim: Tier | null;
  readonly content: MemoryContent;
  readonly sourceChannel: SourceChannel;
  readonly sourceRef: string | null;
  /** Compact JWS; required by the three signed channels (§9.2). */
  readonly sig: string | null;
  readonly subject: string | null;
  readonly predicate: string | null;
  readonly tValid: IsoTimestamp;
  readonly tInvalid: IsoTimestamp | null;
  readonly requestId: string | null;
}

/** Stage 1's output: computed from the verified channel, never from content. */
export interface GrantedProvenance {
  readonly tier: Tier;
  readonly quarantined: boolean;
  /** Mandate jti of the verifying signature, when the channel carried one. */
  readonly signerRef: string | null;
}

/** The `POST /v1/memory/write` body of §4.4, minus the transport envelope. */
export interface MemoryWriteResult {
  readonly status: MemoryWriteStatus;
  readonly memoryId: string | null;
  readonly tierGranted: Tier | null;
  readonly deduped: boolean;
  readonly superseded: readonly string[];
  readonly reasonCode: ReasonCode | null;
  readonly human: string | null;
  readonly toPass: ToPass | null;
  /** `R1.numeric-relaxation` | `R6.llm-judge` | null (§4.4). */
  readonly rule: string | null;
  readonly eventId: string;
}

/** The supersede key of §5.2 f — live rows only, `subject` + `predicate`. */
export interface SupersedeKey {
  readonly tenantId: string;
  readonly userId: string;
  readonly subject: string;
  readonly predicate: string;
}

export function supersedeKeyOf(
  candidate: MemoryWriteCandidate,
): SupersedeKey | null {
  const { subject, predicate } = candidate;
  if (subject === null || predicate === null) {
    return null;
  }
  // Mirrors the SQL of §5.2 f: `subject = NULL` matches no row, ever.
  return {
    tenantId: candidate.tenantId,
    userId: candidate.userId,
    subject,
    predicate,
  };
}

/** What the ledger shows the audit lane without echoing a poisoned payload. */
export const CONTENT_EXCERPT_LIMIT = 240;

export function contentExcerpt(content: MemoryContent): string {
  const serialized = JSON.stringify(content);
  return serialized.length <= CONTENT_EXCERPT_LIMIT
    ? serialized
    : `${serialized.slice(0, CONTENT_EXCERPT_LIMIT)}…`;
}
