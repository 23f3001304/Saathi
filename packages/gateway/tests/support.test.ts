import { describe, expect, it } from "vitest";

import {
  activeBlackout,
  computeDigest,
  entryHashOf,
  periodKeyOf,
  periodResetsAt,
  resolveSignedQuote,
} from "../src/index.js";
import {
  GOLDEN_ENTRIES,
  NOW,
  PREFERENCE_ENTRY,
  QUOTE_ENTRY,
  QUOTE_JTI,
} from "./fixtures.js";

describe("covenant-md-1 digest", () => {
  it("is order-independent: sorting hashes, not ids, is what makes it so", () => {
    expect(computeDigest([...GOLDEN_ENTRIES].reverse())).toBe(
      computeDigest(GOLDEN_ENTRIES),
    );
  });

  it("changes when any canonical field changes", () => {
    const moved = { ...PREFERENCE_ENTRY, content: { shoe_size_uk: 9 } };
    expect(computeDigest([QUOTE_ENTRY, moved])).not.toBe(
      computeDigest(GOLDEN_ENTRIES),
    );
  });

  it("ignores fields outside the fixed list, so a rewrite of one cannot hide", () => {
    const restamped = { ...PREFERENCE_ENTRY, writeEventId: "ev_other" };
    expect(entryHashOf(restamped)).toBe(entryHashOf(PREFERENCE_ENTRY));
  });

  it("emits a prefixed sha256 reference", () => {
    expect(computeDigest(GOLDEN_ENTRIES)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("signed quote resolution", () => {
  it("resolves the P2 attestation from memory by quote_jti", () => {
    const quote = resolveSignedQuote(GOLDEN_ENTRIES, QUOTE_JTI);
    expect(quote?.total_paise).toBe(189900);
    expect(quote?.tier).toBe(2);
  });

  it("returns null when no entry carries that jti", () => {
    expect(resolveSignedQuote(GOLDEN_ENTRIES, "urn:uuid:missing")).toBeNull();
  });
});

describe("envelope period buckets", () => {
  it("buckets by UTC day, ISO week and month", () => {
    expect(periodKeyOf("day", NOW)).toBe("2026-08-31");
    expect(periodKeyOf("month", NOW)).toBe("2026-08");
    // 2026-08-31 is a Monday, so the week starts on the same date.
    expect(periodKeyOf("week", NOW)).toBe("2026-08-31/w");
  });

  it("resets a month bucket on the first of the next month", () => {
    expect(periodResetsAt("month", NOW)).toBe("2026-09-01T00:00:00.000Z");
    expect(periodResetsAt("day", NOW)).toBe("2026-09-01T00:00:00.000Z");
    expect(periodResetsAt("week", NOW)).toBe("2026-09-07T00:00:00.000Z");
  });
});

describe("blackout windows", () => {
  const hours = { tz: "Asia/Kolkata", from: "23:00", to: "06:00" };

  it("returns null when no blackout is declared", () => {
    expect(activeBlackout(null, NOW)).toBeNull();
  });

  it("returns null outside the window", () => {
    // 10:00 UTC is 15:30 in Kolkata — the middle of the afternoon.
    expect(activeBlackout(hours, NOW)).toBeNull();
  });

  it("resolves a wrapping window that `now` sits at the head of", () => {
    const late = new Date("2026-08-31T18:00:00.000Z"); // 23:30 IST
    const window = activeBlackout(hours, late);
    expect(window).not.toBeNull();
    expect(window?.starts_at).toBe("2026-08-31T17:30:00.000Z");
    expect(window?.ends_at).toBe("2026-09-01T00:30:00.000Z");
  });

  it("resolves the tail of a wrapping window as the previous day's", () => {
    const early = new Date("2026-08-31T23:00:00.000Z"); // 04:30 IST, next day
    const window = activeBlackout(hours, early);
    expect(window?.starts_at).toBe("2026-08-31T17:30:00.000Z");
    expect(window?.ends_at).toBe("2026-09-01T00:30:00.000Z");
  });

  it("handles a same-day window without wrapping", () => {
    const window = activeBlackout(
      { tz: "UTC", from: "09:00", to: "17:00" },
      NOW,
    );
    expect(window?.starts_at).toBe("2026-08-31T09:00:00.000Z");
    expect(window?.ends_at).toBe("2026-08-31T17:00:00.000Z");
  });

  it("treats a malformed clock time as no window rather than a default one", () => {
    expect(activeBlackout({ tz: "UTC", from: "9am", to: "17:00" }, NOW)).toBeNull();
  });
});
