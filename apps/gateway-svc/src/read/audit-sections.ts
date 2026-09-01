import type { MemoryEntry, StoredEvent } from "@covenant/domain";
import { tierLabel } from "@covenant/domain";

export interface AuditEvent {
  readonly id: number;
  readonly ts: string;
  readonly actor: string;
  readonly kind: string;
  readonly prev_hash: string;
  readonly this_hash: string;
}

export interface RazorpayCall {
  readonly call: string;
  readonly request_id: string;
  readonly status: number;
  readonly rzp_id: string | null;
  readonly ts: string;
}

export interface AuditOutcome {
  readonly state: string;
  readonly source: "webhook" | "poll";
  readonly ts: string;
}

function field(event: StoredEvent, key: string): unknown {
  return event.payload[key];
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function auditEventsOf(
  events: readonly StoredEvent[],
): readonly AuditEvent[] {
  return events.map((event) => ({
    id: event.seq,
    ts: event.ts,
    actor: event.actor,
    kind: event.kind,
    prev_hash: event.prev_hash,
    this_hash: event.this_hash,
  }));
}

/** The last verdict wins: a commit-phase override rewrites one seal (§5.2 a). */
export function verdictsOf(events: readonly StoredEvent[]): readonly unknown[] {
  const emitted = events.filter((event) => event.kind === "verdict.emitted");
  const latest = emitted[emitted.length - 1];
  const verdicts = latest === undefined ? null : field(latest, "verdicts");
  return Array.isArray(verdicts) ? verdicts : [];
}

export function retrievedIdsOf(events: readonly StoredEvent[]): readonly string[] {
  const retrieved = events.filter((event) => event.kind === "memory.retrieved");
  const ids = retrieved.flatMap((event) => {
    const value = field(event, "entry_ids");
    return Array.isArray(value) ? value : [];
  });
  return ids.filter((id): id is string => typeof id === "string");
}

const RZP_KINDS: Readonly<Record<string, string>> = {
  "rzp.order.created": "orders.create",
  "rzp.link.created": "payment_links.create",
  // The poll reads an order's payments, not a payment by id: it has to work
  // before any payment exists. The journal names the call actually made.
  "rzp.polled": "orders.payments",
};

const RZP_ID_KEYS = [
  "rzp_order_id",
  "rzp_payment_link_id",
  "rzp_payment_id",
] as const;

export function razorpayCallsOf(
  events: readonly StoredEvent[],
): readonly RazorpayCall[] {
  return events
    .filter((event) => RZP_KINDS[event.kind] !== undefined)
    .map((event) => ({
      call: RZP_KINDS[event.kind] ?? event.kind,
      request_id: event.request_id ?? "",
      status: 200,
      rzp_id: RZP_ID_KEYS.map((key) => str(field(event, key))).find(
        (value) => value !== null,
      ) ?? null,
      ts: event.ts,
    }));
}

export function outcomeOf(
  events: readonly StoredEvent[],
): AuditOutcome | null {
  const terminal = events.filter(
    (event) => event.kind === "payment.captured" || event.kind === "payment.failed",
  );
  const latest = terminal[terminal.length - 1];
  if (latest === undefined) {
    return null;
  }
  return {
    state: latest.kind === "payment.captured" ? "captured" : "failed",
    source: str(field(latest, "source")) === "poll" ? "poll" : "webhook",
    ts: latest.ts,
  };
}

export interface AuditMemory {
  readonly id: string;
  readonly type: string;
  readonly tier: string;
  readonly age_seconds: number;
  readonly hash: string;
  readonly source_channel: string;
  readonly quarantined: boolean;
  readonly outcome: "committed" | "rejected" | "retrieved";
}

export function auditMemoriesOf(
  entries: readonly MemoryEntry[],
  now: Date,
): readonly AuditMemory[] {
  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    tier: tierLabel(entry.tier),
    age_seconds: Math.max(
      0,
      Math.floor((now.getTime() - Date.parse(entry.tCreated)) / 1000),
    ),
    hash: entry.entryHash,
    source_channel: entry.sourceChannel,
    quarantined: entry.quarantined,
    outcome: "retrieved",
  }));
}
