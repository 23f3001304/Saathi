import { describe, expect, it } from "vitest";

import {
  isJti,
  isMandateId,
  isMemoryId,
  isTenantId,
  isTxnId,
  toJti,
  toMandateId,
  toMemoryId,
  toTenantId,
  toTxnId,
} from "../src/index.js";

const UUID = "3f9a1c40-8b2e-4d51-9c7a-0b5e91af1234";

const GUARDS = {
  TenantId: isTenantId,
  TxnId: isTxnId,
  MandateId: isMandateId,
  MemoryId: isMemoryId,
  Jti: isJti,
} as const;

const ACCEPTED: readonly (readonly [keyof typeof GUARDS, string])[] = [
  ["TenantId", "acme"],
  ["TenantId", "acme-corp_01"],
  ["TxnId", `txn_${UUID}`],
  ["MandateId", `urn:uuid:${UUID}`],
  ["MemoryId", `mem_${UUID}`],
  ["Jti", `urn:uuid:${UUID}`],
];

const REJECTED: readonly (readonly [keyof typeof GUARDS, string])[] = [
  ["TenantId", ""],
  ["TenantId", "Acme"],
  ["TenantId", "-acme"],
  ["TenantId", "acme corp"],
  ["TxnId", UUID],
  ["TxnId", `txn_${UUID.toUpperCase()}`],
  ["TxnId", `mem_${UUID}`],
  ["TxnId", `txn_${UUID} `],
  ["MandateId", `uuid:${UUID}`],
  ["MandateId", `urn:uuid:${UUID}x`],
  ["MemoryId", `memo_${UUID}`],
  ["Jti", "urn:uuid:not-a-uuid"],
  // v1 UUID: the version nibble is pinned to 4 (section 6.1).
  ["Jti", "urn:uuid:3f9a1c40-8b2e-1d51-9c7a-0b5e91af1234"],
  // Variant nibble must be 8..b.
  ["Jti", "urn:uuid:3f9a1c40-8b2e-4d51-1c7a-0b5e91af1234"],
];

describe("branded id guards", () => {
  it.each(ACCEPTED)('%s accepts "%s"', (name, value) => {
    expect(GUARDS[name](value)).toBe(true);
  });

  it.each(REJECTED)('%s rejects "%s"', (name, value) => {
    expect(GUARDS[name](value)).toBe(false);
  });
});

describe("branded id parsers", () => {
  it("returns the same string when it parses", () => {
    expect(toTenantId("acme")).toBe("acme");
    expect(toTxnId(`txn_${UUID}`)).toBe(`txn_${UUID}`);
    expect(toMandateId(`urn:uuid:${UUID}`)).toBe(`urn:uuid:${UUID}`);
    expect(toMemoryId(`mem_${UUID}`)).toBe(`mem_${UUID}`);
    expect(toJti(`urn:uuid:${UUID}`)).toBe(`urn:uuid:${UUID}`);
  });

  it.each([
    ["TenantId", (): string => toTenantId("Acme")],
    ["TxnId", (): string => toTxnId(UUID)],
    ["MandateId", (): string => toMandateId(`mem_${UUID}`)],
    ["MemoryId", (): string => toMemoryId(`txn_${UUID}`)],
    ["Jti", (): string => toJti("")],
  ])("%s throws rather than coercing", (_name, parse) => {
    expect(parse).toThrow(RangeError);
  });

  it("names the offending type in the error, for a readable boot failure", () => {
    expect(() => toTxnId("nope")).toThrow(/TxnId/);
    expect(() => toMemoryId("nope")).toThrow(/MemoryId/);
  });
});
