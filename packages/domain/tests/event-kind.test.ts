import { describe, expect, it } from "vitest";
import {
  ATTACK_DETECTED_SOURCES,
  EVENT_ACTORS,
  EVENT_KINDS,
  GENESIS_HASH,
  UI_EVENT_KINDS,
  frameOf,
  isEventKind,
  type EventKind,
  type StoredEvent,
} from "../src/index.js";

// frontend-screens §4.2, copied verbatim — the UI's union, in its own order.
const uiDeclared: readonly string[] = [
  "intent.drafted",
  "intent.signed",
  "intent.amended",
  "memory.write.committed",
  "memory.write.rejected",
  "memory.retrieved",
  "catalog.quote.received",
  "cart.assembled",
  "cart.digest.computed",
  "mandate.issued",
  "verdict.emitted",
  "cooloff.parked",
  "cooloff.cancelled",
  "cooloff.released",
  "rzp.order.created",
  "rzp.link.created",
  "rzp.polled",
  "payment.captured",
  "payment.failed",
  "attack.detected",
  "fold.materialized",
  "replay.verified",
];

// The pre-design vocabulary; every one of these is drift if it comes back.
const retiredKinds: readonly string[] = [
  "memory.write",
  "memory.rejected",
  "mandate.verified",
  "mandate.rejected",
  "payment.initiated",
  "attack.blocked",
];

const storedEvent: StoredEvent = {
  seq: 42,
  id: "evt_42",
  ts: "2026-08-31T10:00:00.000Z",
  ts_ms: Date.parse("2026-08-31T10:00:00.000Z"),
  tenant_id: "tnt_demo",
  actor: "gateway",
  kind: "verdict.emitted",
  txn_id: "txn_1",
  request_id: "req_1",
  mandate_id: "urn:uuid:7c02",
  payload: { decision: "approve" },
  prev_hash: "a".repeat(64),
  this_hash: "b".repeat(64),
};

describe("event-kind catalog", () => {
  it("holds every kind in the §10.3 catalog", () => {
    expect(EVENT_KINDS).toHaveLength(52);
  });

  it("has no duplicates", () => {
    expect(new Set(EVENT_KINDS).size).toBe(EVENT_KINDS.length);
  });

  it("adopts the UI's dotted vocabulary with no translation layer", () => {
    expect([...UI_EVENT_KINDS]).toEqual(uiDeclared);
  });

  it("declares every UI kind in the catalog", () => {
    const catalog = new Set<string>(EVENT_KINDS);
    expect(UI_EVENT_KINDS.every((kind) => catalog.has(kind))).toBe(true);
  });

  it.each(retiredKinds)("no longer accepts the retired kind %s", (kind) => {
    expect(isEventKind(kind)).toBe(false);
  });

  it.each(EVENT_KINDS)("recognises %s", (kind: EventKind) => {
    expect(isEventKind(kind)).toBe(true);
  });
});

describe("attack.detected", () => {
  it("is a ledger kind like any other, with no side channel", () => {
    expect(isEventKind("attack.detected")).toBe(true);
  });

  it("covers only blocks not already visible as a rejection or a verdict", () => {
    expect([...ATTACK_DETECTED_SOURCES]).toEqual([
      "pre_tool_use",
      "webhook_signature",
      "ledger_fork",
      "tenant_mismatch",
      "nonce_replay",
    ]);
  });
});

describe("ledger frame", () => {
  it("uses the underscore actor spelling the UI reads", () => {
    expect(EVENT_ACTORS).toContain("buyer_agent");
    expect(EVENT_ACTORS).toContain("merchant_agent");
  });

  it("projects a stored event onto the UI frame, seq as the gapless id", () => {
    expect(frameOf(storedEvent)).toEqual({
      id: 42,
      ts: storedEvent.ts,
      actor: "gateway",
      kind: "verdict.emitted",
      txn_id: "txn_1",
      payload: { decision: "approve" },
      prev_hash: storedEvent.prev_hash,
      this_hash: storedEvent.this_hash,
    });
  });

  it("starts the chain from 64 zeroes", () => {
    expect(GENESIS_HASH).toHaveLength(64);
    expect(GENESIS_HASH).toMatch(/^0+$/);
  });
});
