import { describe, expect, it } from "vitest";

import { canonicalize } from "../src/index.js";

// RFC 8785 section 3.2.3 ordering vector: the C0/C1 members are written as
// escapes so no editor can silently rewrite a control character.
const ORDERING_INPUT = {
  "€": "Euro Sign",
  "\r": "Carriage Return",
  "דּ": "Hebrew Letter Dalet With Dagesh",
  "1": "One",
  "😀": "Emoji: Grinning Face",
  "\u0080": "Control",
  "ö": "Latin Small Letter O With Diaeresis",
};

const ORDERING_OUTPUT =
  '{"\\r":"Carriage Return","1":"One","\u0080":"Control",' +
  '"ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign",' +
  '"😀":"Emoji: Grinning Face",' +
  '"דּ":"Hebrew Letter Dalet With Dagesh"}';

describe("JCS member ordering", () => {
  it("sorts keys by UTF-16 code unit, not by code point", () => {
    // The emoji is a surrogate pair (d83d ...) so it sorts BEFORE U+FB33,
    // though its code point is far higher. Code-point order fails this case.
    expect(canonicalize(ORDERING_INPUT)).toBe(ORDERING_OUTPUT);
  });

  it.each([
    [{ b: 1, a: 2 }, '{"a":2,"b":1}'],
    [{ a: { d: 1, c: 2 }, b: 3 }, '{"a":{"c":2,"d":1},"b":3}'],
    [{ A: 1, a: 2 }, '{"A":1,"a":2}'],
    [{ "": 1, a: 2 }, '{"":1,"a":2}'],
  ])("canonicalizes %j", (value, expected) => {
    expect(canonicalize(value)).toBe(expected);
  });

  it("preserves array order and inserts no whitespace", () => {
    expect(canonicalize([3, 1, 2, { b: 1, a: 2 }])).toBe(
      '[3,1,2,{"a":2,"b":1}]',
    );
  });
});

describe("JCS number forms", () => {
  it.each([
    [0, "0"],
    [-0, "0"],
    [1, "1"],
    [1.0, "1"],
    [4.5, "4.5"],
    [2e-3, "0.002"],
    [1e30, "1e+30"],
    [1e-27, "1e-27"],
    // Written through Number() because the literal loses precision at parse.
    [Number("333333333.33333329"), "333333333.3333333"],
    [9007199254740992, "9007199254740992"],
    [Number.MIN_VALUE, "5e-324"],
    [Number.MAX_VALUE, "1.7976931348623157e+308"],
    [-1.5, "-1.5"],
  ])("serializes %p as %s", (value, expected) => {
    expect(canonicalize(value)).toBe(expected);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "refuses the non-JSON number %p",
    (value) => {
      expect(() => canonicalize(value)).toThrow(RangeError);
    },
  );
});

describe("JCS absent versus null", () => {
  it("keeps an explicit null distinguishable from an absent member", () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
    expect(canonicalize({})).toBe("{}");
    expect(canonicalize({ a: null })).not.toBe(canonicalize({}));
  });

  it("refuses undefined rather than silently omitting it", () => {
    // Rule 2 of section 9.4: omission makes {a: null} and {} hash identically.
    expect(() => canonicalize({ a: undefined })).toThrow(TypeError);
    expect(() => canonicalize([1, undefined])).toThrow(TypeError);
    expect(() => canonicalize(undefined)).toThrow(TypeError);
  });

  it("emits null itself, at every position", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize([null, null])).toBe("[null,null]");
    expect(canonicalize({ a: { b: null } })).toBe('{"a":{"b":null}}');
  });
});

describe("JCS scalars and escapes", () => {
  it.each([
    [true, "true"],
    [false, "false"],
    ["", '""'],
    ["a", '"a"'],
    ["€", '"€"'],
    ["😀", '"😀"'],
  ])("serializes %p as %s", (value, expected) => {
    expect(canonicalize(value)).toBe(expected);
  });

  it("uses the minimal JSON escape set", () => {
    expect(canonicalize('a"b\\c\nd\te\rf\bg\fh')).toBe(
      '"a\\"b\\\\c\\nd\\te\\rf\\bg\\fh"',
    );
    expect(canonicalize("\u000f")).toBe('"\\u000f"');
  });

  it("refuses values that are not JSON at all", () => {
    expect(() => canonicalize(10n)).toThrow(TypeError);
    expect(() => canonicalize(Symbol("s"))).toThrow(TypeError);
    expect(() => canonicalize(() => 1)).toThrow(TypeError);
  });
});

describe("JCS composite handling", () => {
  it("honours toJSON exactly as JSON.stringify does", () => {
    expect(canonicalize(new Date(Date.UTC(2026, 7, 31, 18, 30)))).toBe(
      '"2026-08-31T18:30:00.000Z"',
    );
  });

  it("is stable under re-parsing, so canonicalize is idempotent", () => {
    const value = { z: [1, { b: 2, a: 3 }], a: "x" };
    const once = canonicalize(value);
    expect(canonicalize(JSON.parse(once))).toBe(once);
  });
});
