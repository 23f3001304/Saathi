import { describe, expect, it } from "vitest";

import type { EventHeader, StoredEvent } from "@covenant/domain";
import { GENESIS_HASH, canonicalize, sha256Hex } from "@covenant/domain";

import { HashChain } from "../src/index.js";

const HEADER: EventHeader = {
  id: "00000000-0000-4000-8000-000000000001",
  ts: "2026-08-31T12:00:00.000Z",
  tenant_id: "acme",
  actor: "gateway",
  kind: "verdict.emitted",
  txn_id: "txn_a",
  request_id: null,
  mandate_id: null,
};

const PAYLOAD = { decision: "approve", ms: 12 } as const;

const event = (over: Partial<StoredEvent> = {}): StoredEvent => ({
  ...HEADER,
  seq: 1,
  ts_ms: 0,
  payload: PAYLOAD,
  prev_hash: GENESIS_HASH,
  this_hash: new HashChain().hash(GENESIS_HASH, HEADER, PAYLOAD),
  ...over,
});

describe("the digest formula", () => {
  it("is sha256(prev + LF + canonical header + LF + canonical payload)", () => {
    const chain = new HashChain();
    const expected = sha256Hex(
      [GENESIS_HASH, canonicalize(HEADER), canonicalize(PAYLOAD)].join("\n"),
    );
    expect(chain.hash(GENESIS_HASH, HEADER, PAYLOAD)).toBe(expected);
  });

  it("starts from a 64-zero genesis", () => {
    expect(HashChain.GENESIS).toBe("0".repeat(64));
    expect(HashChain.GENESIS).toHaveLength(64);
  });

  it("ignores non-header fields of a stored event", () => {
    const chain = new HashChain();
    expect(chain.recompute(event({ seq: 42, ts_ms: 999 }))).toBe(
      chain.hash(GENESIS_HASH, HEADER, PAYLOAD),
    );
  });
});

describe("the hash covers the header, not only the payload", () => {
  it.each([
    ["actor", { actor: "user" }],
    ["kind", { kind: "payment.captured" }],
    ["tenant_id", { tenant_id: "evil" }],
    ["txn_id", { txn_id: null }],
    ["request_id", { request_id: "req-1" }],
    ["mandate_id", { mandate_id: "urn:uuid:x" }],
    ["ts", { ts: "2020-01-01T00:00:00.000Z" }],
    ["id", { id: "rewritten" }],
  ] as const)("changes when %s changes", (_field, over) => {
    const chain = new HashChain();
    const base = chain.hash(GENESIS_HASH, HEADER, PAYLOAD);
    expect(chain.hash(GENESIS_HASH, { ...HEADER, ...over }, PAYLOAD)).not.toBe(
      base,
    );
  });

  it("changes when the payload or the predecessor changes", () => {
    const chain = new HashChain();
    const base = chain.hash(GENESIS_HASH, HEADER, PAYLOAD);
    expect(chain.hash(GENESIS_HASH, HEADER, { decision: "reject" })).not.toBe(
      base,
    );
    expect(chain.hash("a".repeat(64), HEADER, PAYLOAD)).not.toBe(base);
  });
});

describe("verifyLink", () => {
  it("accepts a link that extends its predecessor and owns its digest", () => {
    expect(new HashChain().verifyLink(event(), GENESIS_HASH)).toBe(true);
  });

  it.each([
    ["a wrong predecessor", event(), "b".repeat(64)],
    ["a forged digest", event({ this_hash: "c".repeat(64) }), GENESIS_HASH],
    ["a rewritten actor", event({ actor: "attacker" }), GENESIS_HASH],
  ])("rejects %s", (_case, link, previous) => {
    expect(new HashChain().verifyLink(link, previous)).toBe(false);
  });
});
