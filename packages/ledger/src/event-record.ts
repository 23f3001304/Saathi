import type {
  EventActor,
  EventKind,
  EventPayload,
  StoredEvent,
} from "@covenant/domain";
import { EVENT_ACTORS, isEventKind } from "@covenant/domain";

// DECISION: section 2.1 names an `EventRecord` class; this is a pure-function
// module over one row type. Why: `domain` already owns the `StoredEvent`
// entity, and a second class for the same concept is where drift starts.

/** One `events` row, column-for-column with section 3.2. */
export interface EventRecord {
  readonly seq: number;
  readonly id: string;
  readonly ts: string;
  readonly ts_ms: number;
  readonly tenant_id: string;
  readonly actor: string;
  readonly kind: string;
  readonly txn_id: string | null;
  readonly request_id: string | null;
  readonly mandate_id: string | null;
  readonly payload_json: string;
  readonly prev_hash: string;
  readonly this_hash: string;
}

/** DDL order. Insert and rebuild bind by name, so this is the one listing. */
export const EVENT_COLUMNS = [
  "seq",
  "id",
  "ts",
  "ts_ms",
  "tenant_id",
  "actor",
  "kind",
  "txn_id",
  "request_id",
  "mandate_id",
  "payload_json",
  "prev_hash",
  "this_hash",
] as const;

/** Bound by name, so the writer and the rebuild shadow cannot drift apart. */
export const EVENT_INSERT_SQL = `INSERT INTO events (${EVENT_COLUMNS.join(", ")})
VALUES (${EVENT_COLUMNS.map((column) => `@${column}`).join(", ")})`;

export function toEventRecord(event: StoredEvent): EventRecord {
  return {
    seq: event.seq,
    id: event.id,
    ts: event.ts,
    ts_ms: event.ts_ms,
    tenant_id: event.tenant_id,
    actor: event.actor,
    kind: event.kind,
    txn_id: event.txn_id,
    request_id: event.request_id,
    mandate_id: event.mandate_id,
    payload_json: JSON.stringify(event.payload),
    prev_hash: event.prev_hash,
    this_hash: event.this_hash,
  };
}

/**
 * The read boundary. A row that fails the catalog or the payload shape is a
 * corrupted ledger, not a value to coerce — it throws rather than surfacing a
 * half-typed event to a reducer.
 */
export function toStoredEvent(row: EventRecord): StoredEvent {
  return {
    seq: row.seq,
    id: row.id,
    ts: row.ts,
    ts_ms: row.ts_ms,
    tenant_id: row.tenant_id,
    actor: parseActor(row),
    kind: parseKind(row),
    txn_id: row.txn_id,
    request_id: row.request_id,
    mandate_id: row.mandate_id,
    payload: parsePayload(row),
    prev_hash: row.prev_hash,
    this_hash: row.this_hash,
  };
}

function parseActor(row: EventRecord): EventActor {
  if (!(EVENT_ACTORS as readonly string[]).includes(row.actor)) {
    throw new RangeError(`events[${row.seq}]: unknown actor "${row.actor}"`);
  }
  return row.actor as EventActor;
}

function parseKind(row: EventRecord): EventKind {
  if (!isEventKind(row.kind)) {
    throw new RangeError(`events[${row.seq}]: unknown kind "${row.kind}"`);
  }
  return row.kind;
}

function parsePayload(row: EventRecord): EventPayload {
  const parsed: unknown = JSON.parse(row.payload_json);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RangeError(`events[${row.seq}]: payload is not a JSON object`);
  }
  return parsed as EventPayload;
}
