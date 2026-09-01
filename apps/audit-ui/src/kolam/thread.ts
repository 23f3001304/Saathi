// §5 — the kolam ledger line, pure geometry. No React import here: every
// function is a table-tested pure function over plain data (§9 build order:
// "test the geometry before drawing it").
import type { EventKind } from "../ledger/types.ts";

export const PITCH = 44;
export const KNOT_R = 9;
export const LANE_W = 26;
export const LANES = { agent: -1, gateway: 0, rail: 1 } as const;
export const BREAK_GAP = 14;

export type Lane = keyof typeof LANES;
// Widened past §4.5's "load-bearing" sketch to the full vocabulary §5.3
// actually names (hex, disc-ring, hollow-disc) — DECISION, see final report.
export type KnotKind =
  | "pulli"
  | "seal"
  | "lozenge"
  | "hex"
  | "disc"
  | "disc-ring"
  | "hollow-disc"
  | "open"
  | "tick"
  | "unknown";
export type ThreadStatus = "neutral" | "pass" | "fail";

export type ThreadEvent = {
  id: number;
  kind: EventKind;
  lane: Lane;
  knot: KnotKind;
  status: ThreadStatus;
  label?: string;
};

type Pt = { x: number; y: number };

const KNOT_BY_KIND: Partial<Record<EventKind, KnotKind>> = {
  "memory.write.committed": "pulli",
  "memory.retrieved": "pulli",
  "memory.write.rejected": "pulli",
  "intent.signed": "seal",
  "mandate.issued": "seal",
  "verdict.emitted": "lozenge",
  "cart.assembled": "hex",
  "cart.digest.computed": "hex",
  "rzp.order.created": "disc",
  "rzp.link.created": "disc",
  "rzp.polled": "disc",
  "payment.captured": "disc-ring",
  "payment.failed": "hollow-disc",
  "cooloff.parked": "open",
  "fold.materialized": "tick",
  "replay.verified": "tick",
};

/** §5.3 — an unknown kind never silently drops; it renders as a neutral dot. */
export function knotKindForEventKind(kind: EventKind): KnotKind {
  return KNOT_BY_KIND[kind] ?? "unknown";
}

const LANE_BY_KIND: Partial<Record<EventKind, Lane>> = {
  "intent.drafted": "agent",
  "intent.signed": "agent",
  "intent.amended": "agent",
  "memory.write.committed": "agent",
  "memory.write.rejected": "agent",
  "memory.retrieved": "agent",
  "catalog.quote.received": "agent",
  "cart.assembled": "agent",
  "cart.digest.computed": "agent",
  "mandate.issued": "gateway",
  "verdict.emitted": "gateway",
  "cooloff.parked": "gateway",
  "cooloff.cancelled": "gateway",
  "cooloff.released": "gateway",
  "attack.detected": "gateway",
  "fold.materialized": "gateway",
  "replay.verified": "gateway",
  "rzp.order.created": "rail",
  "rzp.link.created": "rail",
  "rzp.polled": "rail",
  "payment.captured": "rail",
  "payment.failed": "rail",
};

export function laneForEventKind(kind: EventKind): Lane {
  return LANE_BY_KIND[kind] ?? "gateway";
}

/** §5.2 entry/exit points of the 240° arc around pulli `i`. */
function arcPoints(
  event: ThreadEvent,
  i: number,
  x0: number,
  y0: number,
): { entry: Pt; exit: Pt; sweep: 0 | 1 } {
  const x = x0 + LANES[event.lane] * LANE_W;
  const y = y0 + i * PITCH;
  const s = i % 2 === 0 ? 1 : -1;
  const entry = { x: x - s * 0.5 * KNOT_R, y: y - 0.866 * KNOT_R };
  const exit = { x: x - s * 0.5 * KNOT_R, y: y + 0.866 * KNOT_R };
  return { entry, exit, sweep: s > 0 ? 1 : 0 };
}

/** §5.2 — verbatim algorithm. Append-only: segment i depends only on events ≤ i. */
export function buildThread(
  events: ThreadEvent[],
  x0: number,
  y0: number,
): string {
  if (events.length === 0) return "";
  const h = (PITCH - 1.732 * KNOT_R) / 2;
  let d = "";
  let prevExit: Pt | null = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event === undefined) continue;
    const { entry, exit, sweep } = arcPoints(event, i, x0, y0);
    d +=
      prevExit === null
        ? `M ${entry.x} ${entry.y}`
        : ` C ${prevExit.x} ${prevExit.y + h} ${entry.x} ${entry.y - h} ${entry.x} ${entry.y}`;
    d += ` A ${KNOT_R} ${KNOT_R} 0 1 ${sweep} ${exit.x} ${exit.y}`;
    prevExit = exit;
  }
  return d;
}

/**
 * §5.4 growth — a self-contained path fragment for exactly one new segment.
 * Unlike the substring §5.4 describes appending onto a mutable ref, this
 * renders as its OWN `<path>` element (KolamThread's simpler full-recompute
 * model — see the DECISION note there), so it always opens with its own
 * `M`, even when continuing from the previous event's exit point.
 */
export function buildSegment(
  events: ThreadEvent[],
  index: number,
  x0: number,
  y0: number,
): string {
  const event = events[index];
  if (event === undefined) return "";
  const h = (PITCH - 1.732 * KNOT_R) / 2;
  const { entry, exit, sweep } = arcPoints(event, index, x0, y0);
  const previous = index > 0 ? events[index - 1] : undefined;
  let d = "";
  if (previous !== undefined) {
    const prevExit = arcPoints(previous, index - 1, x0, y0).exit;
    d += `M ${prevExit.x} ${prevExit.y}`;
    d += ` C ${prevExit.x} ${prevExit.y + h} ${entry.x} ${entry.y - h} ${entry.x} ${entry.y}`;
  } else {
    d += `M ${entry.x} ${entry.y}`;
  }
  d += ` A ${KNOT_R} ${KNOT_R} 0 1 ${sweep} ${exit.x} ${exit.y}`;
  return d;
}

/** First fatal event — a failing verdict or a rejected write (§3.2, §5.5). */
export function findBreakIndex(events: ThreadEvent[]): number | undefined {
  const index = events.findIndex((e) => e.status === "fail");
  return index === -1 ? undefined : index;
}

export type BrokenThread = { above: string; below: string };

/** §5.5 — the poisoned branch dead-ends; the chain resumes BREAK_GAP below
 * with a fresh `M`, exactly like the ledger itself continuing past a rejected write. */
export function buildBrokenThread(
  events: ThreadEvent[],
  breakIndex: number,
  x0: number,
  y0: number,
): BrokenThread {
  const above = buildThread(events.slice(0, breakIndex + 1), x0, y0);
  const belowEvents = events.slice(breakIndex + 1);
  const belowY0 = y0 + (breakIndex + 1) * PITCH + BREAK_GAP;
  const below = buildThread(belowEvents, x0, belowY0);
  return { above, below };
}

export function pulliCenter(
  event: ThreadEvent,
  index: number,
  x0: number,
  y0: number,
): Pt {
  return { x: x0 + LANES[event.lane] * LANE_W, y: y0 + index * PITCH };
}
