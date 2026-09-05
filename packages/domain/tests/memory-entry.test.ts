import { describe, expect, it } from "vitest";
import {
  MEMORY_CANONICAL_FIELDS,
  MEMORY_DIGEST_ALG,
  isLive,
  isValidAt,
  toCanonicalForm,
  wasRetiredBefore,
  type MemoryEntry,
} from "../src/index.js";
import { memoryEntry } from "./fixtures.js";

const sparse: MemoryEntry = {
  ...memoryEntry,
  subject: null,
  predicate: null,
  sourceRef: null,
  tInvalid: null,
  tExpired: null,
};

const retired: MemoryEntry = {
  ...memoryEntry,
  tExpired: "2026-08-31T09:30:00.000Z",
  supersededBy: "mem_9f2",
};

describe("covenant-md-1 canonical form", () => {
  it("versions the algorithm so an unknown one is rejected, not guessed", () => {
    expect(MEMORY_DIGEST_ALG).toBe("covenant-md-1");
  });

  it("hashes exactly the fourteen fixed fields", () => {
    expect(MEMORY_CANONICAL_FIELDS).toEqual([
      "id",
      "tenant_id",
      "user_id",
      "type",
      "tier",
      "subject",
      "predicate",
      "content",
      "source_channel",
      "source_ref",
      "t_valid",
      "t_invalid",
      "t_created",
      "t_expired",
    ]);
    expect(Object.keys(toCanonicalForm(memoryEntry))).toEqual([
      ...MEMORY_CANONICAL_FIELDS,
    ]);
  });
});

describe("covenant-md-1 field discipline", () => {
  it("emits absent fields as null rather than omitting them", () => {
    const form = toCanonicalForm(sparse);
    const absent = [
      "subject",
      "predicate",
      "source_ref",
      "t_invalid",
      "t_expired",
    ];
    for (const field of absent) {
      expect(Object.hasOwn(form, field)).toBe(true);
      expect(form[field as keyof typeof form]).toBeNull();
    }
  });

  it("carries the integer tier, never the wire label", () => {
    expect(toCanonicalForm(memoryEntry).tier).toBe(2);
  });

  it("emits the retirement stamp as null, so the hash outlives the belief", () => {
    expect(toCanonicalForm(retired).t_expired).toBeNull();
    expect(toCanonicalForm(retired)).toEqual(toCanonicalForm(memoryEntry));
    expect(retired.tExpired).not.toBeNull();
  });

  it("leaves storage-only fields out of the hash input", () => {
    const form: Record<string, unknown> = { ...toCanonicalForm(retired) };
    for (const field of [
      "entry_hash",
      "content_hash",
      "quarantined",
      "superseded_by",
    ]) {
      expect(Object.hasOwn(form, field)).toBe(false);
    }
  });
});

describe("bi-temporal predicates", () => {
  it("treats an entry with no t_expired as live", () => {
    expect(isLive(memoryEntry)).toBe(true);
    expect(isLive(retired)).toBe(false);
  });

  it("refuses beliefs the agent had already retired when the cart was signed", () => {
    expect(wasRetiredBefore(retired, "2026-08-31T10:00:00.000Z")).toBe(true);
    expect(wasRetiredBefore(retired, "2026-08-31T09:00:00.000Z")).toBe(false);
    expect(wasRetiredBefore(memoryEntry, "2026-08-31T10:00:00.000Z")).toBe(
      false,
    );
  });

  it("separates world-time validity from system-time belief", () => {
    const bounded: MemoryEntry = {
      ...memoryEntry,
      tValid: "2026-08-31T09:00:00.000Z",
      tInvalid: "2026-08-31T10:00:00.000Z",
    };
    expect(isValidAt(bounded, "2026-08-31T09:30:00.000Z")).toBe(true);
    expect(isValidAt(bounded, "2026-08-31T10:30:00.000Z")).toBe(false);
    expect(isValidAt(bounded, "2026-08-31T08:30:00.000Z")).toBe(false);
    expect(isLive(bounded)).toBe(true);
  });

  it("keeps the supersede pointer alongside the expiry", () => {
    expect(retired.supersededBy).toBe("mem_9f2");
    expect(retired.tExpired).not.toBeNull();
  });
});
