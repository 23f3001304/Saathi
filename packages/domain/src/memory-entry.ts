import type { Sha256Hex } from "./hash-ref.js";
import type { IsoTimestamp } from "./iso-timestamp.js";
import { isBefore } from "./iso-timestamp.js";
import type { MemoryType, SourceChannel, Tier } from "./memory-type.js";

export type MemoryContent = Readonly<Record<string, unknown>>;

/**
 * Bi-temporal memory entry (§3.4). World-time (`tValid`/`tInvalid`) is when the
 * claim was true; system-time (`tCreated`/`tExpired`) is when we believed it.
 * Rows are invalidated, never deleted: `tExpired` + `supersededBy` replace it.
 */
export interface MemoryEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly type: MemoryType;
  readonly tier: Tier;
  readonly quarantined: boolean;
  /** The supersede key: sku / merchant / `user`. */
  readonly subject: string | null;
  readonly predicate: string | null;
  readonly content: MemoryContent;
  readonly contentHash: Sha256Hex;
  readonly entryHash: Sha256Hex;
  readonly sourceChannel: SourceChannel;
  readonly sourceRef: string | null;
  readonly tValid: IsoTimestamp;
  readonly tInvalid: IsoTimestamp | null;
  readonly tCreated: IsoTimestamp;
  readonly tExpired: IsoTimestamp | null;
  readonly supersededBy: string | null;
  readonly writeEventId: string;
}

/** The digest algorithm travels signed inside the Cart Mandate (§9.4 rule 4). */
export const MEMORY_DIGEST_ALG = "covenant-md-1";

export type MemoryDigestAlg = typeof MEMORY_DIGEST_ALG;

/**
 * `covenant-md-1` canonical form (§9.4): a FIXED field list whose absent
 * members are emitted as `null` rather than omitted, so that adding a field
 * cannot silently rewrite history. Key order is irrelevant — RFC 8785 (JCS)
 * sorts keys — and the hash carries the integer tier, not the wire label.
 *
 * `entryHash = sha256Hex(canonicalize(form))`; the digest is
 * `sha256:<sha256Hex(entryHashes.sort().join('\n'))>`. Neither computation
 * lives here: domain states the contract, adapters own the crypto.
 */
export interface MemoryEntryCanonicalForm {
  readonly id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly type: MemoryType;
  readonly tier: Tier;
  readonly subject: string | null;
  readonly predicate: string | null;
  readonly content: MemoryContent;
  readonly source_channel: SourceChannel;
  readonly source_ref: string | null;
  readonly t_valid: IsoTimestamp;
  readonly t_invalid: IsoTimestamp | null;
  readonly t_created: IsoTimestamp;
  readonly t_expired: IsoTimestamp | null;
}

/**
 * DECISION: `t_expired` stays in the field list and is always hashed as
 * `null`. Why: §9.4's own immutability trigger lets `t_expired` change after a
 * row is written while forbidding `entry_hash` to change, so hashing the live
 * value hashes a moving field, and the stored hash and the recomputed one
 * drift apart the moment a belief is superseded.
 *
 * It broke the honest case. A cart left on the hold-to-buy button while the
 * shopper kept talking had two of its constraints superseded by the next
 * covenant they signed. Every belief the cart named still said exactly what it
 * had said, yet the digest no longer matched, and the cart was refused as
 * though a memory had been swapped underneath it.
 *
 * Retirement is a fact about us; the claim is unchanged. World-time validity
 * (`t_invalid`) is part of the claim and stays hashed. Signing over a belief
 * that was already retired when the cart was issued is still refused, by
 * `wasRetiredBefore` as `MEMORY_ENTRY_EXPIRED` — a rule this makes reachable
 * for the first time, since any expiry used to break the digest first.
 *
 * The algorithm id does not move: no digest a read gate ever minted changes
 * value, because retrieval returns live rows only.
 */
export const MEMORY_CANONICAL_FIELDS: readonly (keyof MemoryEntryCanonicalForm)[] =
  [
    "id",
    "tenant_id",
    "user_id",
    "type",
    "tier",
    "subject",
    "predicate",
    "content",
    "source_channel",
    "source_ref",
    "t_valid",
    "t_invalid",
    "t_created",
    "t_expired",
  ];

export function toCanonicalForm(entry: MemoryEntry): MemoryEntryCanonicalForm {
  return {
    id: entry.id,
    tenant_id: entry.tenantId,
    user_id: entry.userId,
    type: entry.type,
    tier: entry.tier,
    subject: entry.subject,
    predicate: entry.predicate,
    content: entry.content,
    source_channel: entry.sourceChannel,
    source_ref: entry.sourceRef,
    t_valid: entry.tValid,
    t_invalid: entry.tInvalid,
    t_created: entry.tCreated,
    t_expired: null,
  };
}

/** System-time: we still believe it. */
export function isLive(entry: MemoryEntry): boolean {
  return entry.tExpired === null;
}

/**
 * `MemoryDigestCheck` predicate 4 (§8.4): the agent may not sign over beliefs
 * it had already retired when the cart was issued.
 */
export function wasRetiredBefore(
  entry: MemoryEntry,
  instant: IsoTimestamp,
): boolean {
  return entry.tExpired !== null && isBefore(entry.tExpired, instant);
}

/** World-time: the claim was true across `instant`. */
export function isValidAt(entry: MemoryEntry, instant: IsoTimestamp): boolean {
  if (isBefore(instant, entry.tValid)) {
    return false;
  }
  return entry.tInvalid === null || isBefore(instant, entry.tInvalid);
}
