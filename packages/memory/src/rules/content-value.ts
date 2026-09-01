import type { MemoryContent } from "@covenant/domain";

/**
 * DECISION: memory `content` is free-form JSON in the DDL (§3.4), so the rules
 * need one shared answer to "what value is this entry asserting". A candidate
 * asserts `content.value`, falling back to `content[predicate]`; units travel
 * as `content.unit` and `content.currency`. Why one module: R1, R2, R3 and R5
 * must read a constraint the *same* way, or a bound could be widened by
 * spelling it differently.
 */
export function valueOf(
  content: MemoryContent,
  predicate: string | null,
): unknown {
  if (Object.hasOwn(content, "value")) {
    return content["value"];
  }
  if (predicate !== null && Object.hasOwn(content, predicate)) {
    return content[predicate];
  }
  return undefined;
}

export function numberOf(
  content: MemoryContent,
  predicate: string | null,
): number | null {
  const value = valueOf(content, predicate);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function booleanOf(
  content: MemoryContent,
  predicate: string | null,
): boolean | null {
  const value = valueOf(content, predicate);
  return typeof value === "boolean" ? value : null;
}

export function stringOf(
  content: MemoryContent,
  predicate: string | null,
): string | null {
  const value = valueOf(content, predicate);
  return typeof value === "string" ? value : null;
}

/** RFC 3339 instants compare as instants, never as strings. */
export function instantOf(
  content: MemoryContent,
  predicate: string | null,
): number | null {
  const value = valueOf(content, predicate);
  if (typeof value !== "string") {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function unitOf(content: MemoryContent): string | null {
  const unit = content["unit"];
  return typeof unit === "string" ? unit : null;
}

export function currencyOf(content: MemoryContent): string | null {
  const currency = content["currency"];
  return typeof currency === "string" ? currency : null;
}

/** Membership lists, accepted under any of the spellings §6.2 uses. */
export function listOf(
  content: MemoryContent,
  keys: readonly string[],
): readonly string[] | null {
  for (const key of keys) {
    const value = content[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return null;
}
