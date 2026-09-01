import type { MemoryEntry, StoredEvent } from "@covenant/domain";

import type { MemoryWriteCandidate } from "../src/index.js";

import { TENANT, USER, type Stack } from "./harness.js";

const DEFAULT_CANDIDATE: MemoryWriteCandidate = {
  tenantId: TENANT,
  userId: USER,
  type: "fact",
  tierClaim: null,
  content: { value: 1 },
  sourceChannel: "verified_api",
  sourceRef: null,
  sig: null,
  subject: null,
  predicate: null,
  tValid: "2026-08-31T00:00:00.000Z",
  tInvalid: null,
  requestId: "req_test",
};

export function candidate(
  overrides: Partial<MemoryWriteCandidate> = {},
): MemoryWriteCandidate {
  return { ...DEFAULT_CANDIDATE, ...overrides };
}

const DEFAULT_ENTRY: MemoryEntry = {
  id: "mem_00000000-0000-4000-8000-00000000000f",
  tenantId: TENANT,
  userId: USER,
  type: "constraint",
  tier: 3,
  quarantined: false,
  subject: "user",
  predicate: "max_amount",
  content: { value: 200000, currency: "INR", unit: "paise" },
  contentHash: "a".repeat(64),
  entryHash: "b".repeat(64),
  sourceChannel: "user_signed_mandate",
  sourceRef: null,
  tValid: "2026-08-01T00:00:00.000Z",
  tInvalid: null,
  tCreated: "2026-08-01T00:00:00.000Z",
  tExpired: null,
  supersededBy: null,
  writeEventId: "evt_1",
};

/** A `MemoryEntry` for the pure rule tests, which never touch the database. */
export function entryOf(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return { ...DEFAULT_ENTRY, ...overrides };
}

export function kindsOf(stack: Stack): readonly string[] {
  return stack.events.readFrom(1, 500).map((event: StoredEvent) => event.kind);
}

export function payloadsOf(stack: Stack, kind: string): readonly StoredEvent[] {
  return stack.events.readFrom(1, 500).filter((event) => event.kind === kind);
}

export function liveRowCount(stack: Stack): number {
  const row = stack.db
    .prepare("SELECT count(*) AS n FROM memory WHERE t_expired IS NULL")
    .get() as { n: number };
  return row.n;
}
