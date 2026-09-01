import type { EventPayload, StoredEvent } from "@covenant/domain";
import { sha256Hex } from "@covenant/domain";

/**
 * Defensive payload readers shared by the three flywheel folds. Event
 * payloads are `Record<string, unknown>` at the type boundary (section 10.3
 * lists only the "key" fields, not an exhaustive schema, and the ledger's own
 * `test-folds.ts` reads `merchant_id` the same defensive way even though it
 * is absent from that list) — every reader below returns a safe fallback
 * instead of throwing, so an unexpected payload shape degrades to a no-op
 * rather than crashing a replay (section 3.10 rule 1: pure, total).
 */

export function textField(
  payload: EventPayload,
  key: string,
  fallback: string,
): string {
  const value = payload[key];
  return typeof value === "string" ? value : fallback;
}

export function optionalText(
  payload: EventPayload,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

export function numberField(
  payload: EventPayload,
  key: string,
  fallback: number,
): number {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

export function arrayField(
  payload: EventPayload,
  key: string,
): readonly unknown[] {
  const value = payload[key];
  return Array.isArray(value) ? value : [];
}

export function objectField(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Rule 1 (section 3.10): derived ids are `sha256(event.id + reducer.name)`,
 * never `crypto.randomUUID()` — a rebuild must mint the identical id.
 */
export function derivedId(event: StoredEvent, reducerName: string): string {
  return sha256Hex(`${event.id}${reducerName}`).slice(0, 32);
}
