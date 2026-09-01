// The `amendment` beat, read off the wire into the one pending set.
//
// DECISION: the beat is rebuilt field by field rather than cast. The host
// computes a direction and sends it; this parser has nowhere to put it, so it
// is dropped on the floor and the screen derives its own. A wire that could
// hand the UI a direction would be a wire that could hand it the wrong one.
import type { PendingAmendment, ProposedChange } from "./amendmentModel.ts";
import { proposeAmendment } from "./pendingAmendments.ts";

function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function text(raw: Record<string, unknown>, key: string): string | null {
  const value = raw[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function scalar(value: unknown): number | boolean | null {
  if (typeof value === "boolean") return value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function changeOf(value: unknown): ProposedChange | null {
  const raw = fields(value);
  if (raw === null) return null;
  const rule = text(raw, "rule");
  const to = scalar(raw["to"]);
  if (rule === null || to === null) return null;
  return {
    rule,
    scope: text(raw, "scope"),
    from: scalar(raw["from"]),
    to,
    unit: text(raw, "unit"),
    currency: text(raw, "currency"),
  };
}

/** An amendment with no readable change is not an amendment. */
export function parseAmendmentBeat(value: unknown): PendingAmendment | null {
  const raw = fields(value);
  if (raw === null || raw["kind"] !== "amendment") return null;
  const id = text(raw, "amendmentId");
  const summary = text(raw, "summary");
  const list = raw["changes"];
  if (id === null || summary === null || !Array.isArray(list)) return null;
  const changes = list
    .map(changeOf)
    .filter((change): change is ProposedChange => change !== null);
  if (changes.length === 0) return null;
  return { id, summary, changes, proposedAt: new Date().toISOString() };
}

/** True when the beat became a pending amendment. */
export function applyAmendmentBeat(value: unknown): boolean {
  const amendment = parseAmendmentBeat(value);
  if (amendment === null) return false;
  proposeAmendment(amendment);
  return true;
}
