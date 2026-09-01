import type { IsoTimestamp, Sha256Ref } from "@covenant/domain";
import { DomainError, isIsoTimestamp, isSha256Ref } from "@covenant/domain";

/**
 * Structural readers for a credential subject. Every failure is
 * `MANDATE_MALFORMED` — "I could not read this as a signed credential" is an
 * invalid-request answer, deliberately distinct from "I read it and it broke a
 * rule", which is a 200 verdict (§4.6).
 */
export function malformed(): DomainError {
  return new DomainError("MANDATE_MALFORMED");
}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw malformed();
  }
  return value as Record<string, unknown>;
}

export function array(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw malformed();
  }
  return value;
}

export function str(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw malformed();
  }
  return value;
}

export function num(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw malformed();
  }
  return value;
}

export function int(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw malformed();
  }
  return value;
}

export function bool(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw malformed();
  }
  return value;
}

export function nullableStr(value: unknown): string | null {
  return value === null ? null : str(value);
}

export function strings(value: unknown): readonly string[] {
  return array(value).map((item) => str(item));
}

export function nullableStrings(value: unknown): readonly string[] | null {
  return value === null ? null : strings(value);
}

export function hashRef(value: unknown): Sha256Ref {
  const ref = str(value);
  if (!isSha256Ref(ref)) {
    throw malformed();
  }
  return ref;
}

export function timestamp(value: unknown): IsoTimestamp {
  const iso = str(value);
  if (!isIsoTimestamp(iso)) {
    throw malformed();
  }
  return iso;
}

export function nullable<T>(
  value: unknown,
  read: (raw: unknown) => T,
): T | null {
  return value === null || value === undefined ? null : read(value);
}

export function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  const raw = str(value);
  if (!(allowed as readonly string[]).includes(raw)) {
    throw malformed();
  }
  return raw as T;
}
