import { describe, expect, it } from "vitest";
import {
  AP2_EXTENSION_URI,
  MANDATE_ALG,
  PINNED_CONTEXT_URIS,
  isBefore,
  isIsoTimestamp,
  isKid,
  isSha256Hex,
  isSha256Ref,
  roleOfKid,
  sha256HexOf,
  toIsoTimestamp,
  toSha256Ref,
} from "../src/index.js";

const HEX = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

describe("hash references", () => {
  it("round-trips between the stored hex and the signed reference", () => {
    expect(toSha256Ref(HEX)).toBe(`sha256:${HEX}`);
    expect(sha256HexOf(`sha256:${HEX}`)).toBe(HEX);
  });

  it.each([HEX.toUpperCase(), HEX.slice(0, 63), `sha256:${HEX}`, ""])(
    'rejects "%s" as bare hex',
    (value) => {
      expect(isSha256Hex(value)).toBe(false);
    },
  );

  it.each([HEX, `sha-256:${HEX}`, `sha256:${HEX.slice(0, 63)}`])(
    'rejects "%s" as a reference',
    (value) => {
      expect(isSha256Ref(value)).toBe(false);
    },
  );

  it("throws rather than coercing a malformed digest", () => {
    expect(() => toSha256Ref("nope")).toThrow(RangeError);
    expect(() => sha256HexOf("nope")).toThrow(RangeError);
  });
});

describe("timestamps", () => {
  it.each([
    "2026-08-31T18:30:00.000Z",
    "2026-08-31T18:30:00Z",
    "2026-08-31T18:30:00+05:30",
  ])('accepts "%s"', (value) => {
    expect(isIsoTimestamp(value)).toBe(true);
  });

  it.each(["2026-08-31", "31/08/2026", "2026-08-31 18:30:00", ""])(
    'rejects "%s"',
    (value) => {
      expect(isIsoTimestamp(value)).toBe(false);
    },
  );

  it("orders across offsets rather than by string comparison", () => {
    // 18:30+05:30 is 13:00Z: earlier than 14:00Z, though it sorts later as text.
    expect(
      isBefore("2026-08-31T18:30:00+05:30", "2026-08-31T14:00:00.000Z"),
    ).toBe(true);
    expect(
      isBefore("2026-08-31T14:00:00.000Z", "2026-08-31T18:30:00+05:30"),
    ).toBe(false);
  });

  it("emits UTC with millisecond precision", () => {
    expect(toIsoTimestamp(new Date(Date.UTC(2026, 7, 31, 18, 30)))).toBe(
      "2026-08-31T18:30:00.000Z",
    );
  });
});

describe("trust ring", () => {
  it("parses the role out of a kid", () => {
    expect(roleOfKid("merchant-2026-08-3f9a1c40")).toBe("merchant");
    expect(roleOfKid("gateway-2026-08-0b5e91af")).toBe("gateway");
    expect(roleOfKid("attacker-2026-08-0b5e91af")).toBeNull();
  });

  it.each([
    "merchant-2026-8-3f9a1c40",
    "merchant-2026-08-3F9A1C40",
    "merchant",
  ])('rejects "%s" as a kid', (kid) => {
    expect(isKid(kid)).toBe(false);
  });

  it("pins the AP2 extension URI and the W3C context, exactly", () => {
    expect(AP2_EXTENSION_URI).toBe("https://covenant.dev/ns/ap2/v1");
    expect(PINNED_CONTEXT_URIS[0]).toBe("https://www.w3.org/ns/credentials/v2");
    expect(PINNED_CONTEXT_URIS).toHaveLength(2);
  });

  it("pins ES256 as the only algorithm", () => {
    expect(MANDATE_ALG).toBe("ES256");
  });
});
