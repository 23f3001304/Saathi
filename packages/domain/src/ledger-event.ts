import type { EventActor, EventKind } from "./event-kind.js";
import type { Sha256Hex } from "./hash-ref.js";
import type { IsoTimestamp } from "./iso-timestamp.js";
import type { ReasonCode } from "./reason-code.js";

export type EventPayload = Readonly<Record<string, unknown>>;

/** What a caller supplies; the sink owns identity, time and the hash chain. */
export interface EventDraft {
  readonly tenant_id: string;
  readonly actor: EventActor;
  readonly kind: EventKind;
  readonly txn_id: string | null;
  readonly request_id: string | null;
  readonly mandate_id: string | null;
  readonly payload: EventPayload;
}

/**
 * The chain covers the header, not only the payload (decision 10): without it
 * `actor` or `kind` could be rewritten in place with the chain still
 * verifying — exactly the fields the audit UI displays.
 */
export interface EventHeader {
  readonly id: string;
  readonly ts: IsoTimestamp;
  readonly tenant_id: string;
  readonly actor: EventActor;
  readonly kind: EventKind;
  readonly txn_id: string | null;
  readonly request_id: string | null;
  readonly mandate_id: string | null;
}

/**
 * `this_hash = sha256Hex(prev_hash + '\n' + canonicalize(header) + '\n' +
 * canonicalize(payload))`, and `seq` is `head.seq + 1` assigned inside the
 * transaction — gapless, because the UI folds and reconnects on it (§3.2).
 */
export interface StoredEvent extends EventHeader {
  readonly seq: number;
  readonly ts_ms: number;
  readonly payload: EventPayload;
  readonly prev_hash: Sha256Hex;
  readonly this_hash: Sha256Hex;
}

export const GENESIS_HASH: Sha256Hex = "0".repeat(64);

/**
 * The audit UI's frame, served verbatim over SSE and over the polling
 * backfill so the two are interchangeable (§4.11).
 */
export interface LedgerFrame {
  readonly id: number;
  readonly ts: IsoTimestamp;
  readonly actor: EventActor;
  readonly kind: EventKind;
  readonly txn_id: string | null;
  readonly payload: unknown;
  readonly prev_hash: Sha256Hex;
  readonly this_hash: Sha256Hex;
}

/** One projection, so stream and backfill cannot drift apart. */
export function frameOf(event: StoredEvent): LedgerFrame {
  return {
    id: event.seq,
    ts: event.ts,
    actor: event.actor,
    kind: event.kind,
    txn_id: event.txn_id,
    payload: event.payload,
    prev_hash: event.prev_hash,
    this_hash: event.this_hash,
  };
}

export interface AttackDetectedPayload {
  /** `T-1` | `T-27` | `T-31` for the harness threats; `null` otherwise. */
  readonly attack_id: string | null;
  readonly reason_code: ReasonCode;
  readonly human: string;
  readonly detail_kind: string;
}
