import { describe, expect, it } from "vitest";

import { canonicalize, sha256Hex, sha256Of, sha256RefOf } from "../src/index.js";

// FIPS 180-4 / NIST published vectors.
const VECTORS: readonly (readonly [string, string])[] = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  ["hello", "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"],
  [
    "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
  ],
  [
    "The quick brown fox jumps over the lazy dog",
    "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  ],
];

describe("sha256Hex", () => {
  it.each(VECTORS)('hashes "%s"', (input, expected) => {
    expect(sha256Hex(input)).toBe(expected);
  });

  it.each(VECTORS)('emits lowercase hex of fixed width for "%s"', (input) => {
    expect(sha256Hex(input)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sha256Of", () => {
  it("hashes the canonical form, not the JavaScript literal", () => {
    expect(sha256Of("abc")).toBe(sha256Hex('"abc"'));
    expect(sha256Of("abc")).not.toBe(sha256Hex("abc"));
  });

  it.each([
    [{ b: 1, a: 2 }, { a: 2, b: 1 }],
    [{ x: [1, { d: 4, c: 3 }] }, { x: [1, { c: 3, d: 4 }] }],
  ])("is independent of key order: %j vs %j", (left, right) => {
    expect(sha256Of(left)).toBe(sha256Of(right));
  });

  it("separates an explicit null from an absent member", () => {
    expect(sha256Of({ a: null })).not.toBe(sha256Of({}));
  });

  it("agrees with canonicalize composed with sha256Hex", () => {
    const value = { tier: 3, subject: null, content: { k: 1e30 } };
    expect(sha256Of(value)).toBe(sha256Hex(canonicalize(value)));
  });
});

describe("sha256RefOf", () => {
  it("prefixes the bare hex with the wire form of section 6.1", () => {
    expect(sha256RefOf("abc")).toBe(`sha256:${sha256Of("abc")}`);
  });

  it.each(VECTORS)('produces a well-formed reference for "%s"', (input) => {
    expect(sha256RefOf(input)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
