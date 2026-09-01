import { describe, expect, it } from "vitest";
import {
  buildThread,
  buildBrokenThread,
  buildSegment,
  findBreakIndex,
  knotKindForEventKind,
  laneForEventKind,
  type ThreadEvent,
} from "../src/kolam/thread.ts";

function event(overrides: Partial<ThreadEvent>): ThreadEvent {
  return { id: 1, kind: "fold.materialized", lane: "gateway", knot: "tick", status: "neutral", ...overrides };
}

describe("knotKindForEventKind", () => {
  it("maps the §5.3 table for representative kinds", () => {
    expect(knotKindForEventKind("memory.write.committed")).toBe("pulli");
    expect(knotKindForEventKind("memory.write.rejected")).toBe("pulli");
    expect(knotKindForEventKind("intent.signed")).toBe("seal");
    expect(knotKindForEventKind("verdict.emitted")).toBe("lozenge");
    expect(knotKindForEventKind("cart.assembled")).toBe("hex");
    expect(knotKindForEventKind("rzp.polled")).toBe("disc");
    expect(knotKindForEventKind("payment.captured")).toBe("disc-ring");
    expect(knotKindForEventKind("payment.failed")).toBe("hollow-disc");
    expect(knotKindForEventKind("cooloff.parked")).toBe("open");
    expect(knotKindForEventKind("replay.verified")).toBe("tick");
  });

  it("never drops an unrecognised kind — it renders as a neutral dot", () => {
    // A kind absent from the lookup table (e.g. a gateway-internal kind the
    // UI doesn't declare) must still resolve to something, not throw.
    expect(knotKindForEventKind("intent.amended")).toBe("unknown");
  });
});

describe("laneForEventKind", () => {
  it("assigns agent/gateway/rail per §5.1's three-lane split", () => {
    expect(laneForEventKind("memory.retrieved")).toBe("agent");
    expect(laneForEventKind("verdict.emitted")).toBe("gateway");
    expect(laneForEventKind("rzp.order.created")).toBe("rail");
  });
});

describe("buildThread", () => {
  it("returns an empty string for no events", () => {
    expect(buildThread([], 0, 0)).toBe("");
  });

  it("is append-only: one arc per event, one cubic connector between consecutive events", () => {
    const events = [event({ id: 1 }), event({ id: 2 }), event({ id: 3 })];
    const d = buildThread(events, 100, 0);
    expect(d.match(/A /g)).toHaveLength(3);
    expect(d.match(/C /g)).toHaveLength(2);
    expect(d.startsWith("M ")).toBe(true);
  });

  it("prefixing more events only appends to the existing segment count", () => {
    const first = buildThread([event({ id: 1 }), event({ id: 2 })], 100, 0);
    const extended = buildThread([event({ id: 1 }), event({ id: 2 }), event({ id: 3 })], 100, 0);
    expect(extended.startsWith(first)).toBe(true);
  });

  it("alternates the arc sweep flag by pulli parity (the woven bulge)", () => {
    const d = buildThread([event({ id: 1 }), event({ id: 2 })], 100, 0);
    const sweeps = [...d.matchAll(/A 9 9 0 1 (\d)/g)].map((m) => m[1]);
    expect(sweeps).toEqual(["1", "0"]);
  });
});

describe("buildSegment", () => {
  it("is a self-contained path — always opens with its own M, even continuing from a prior event", () => {
    // Regression: this fragment renders as its OWN <path> element
    // (KolamThread's live-segment path), not appended onto another path's
    // `d` string. A bare `C ...`/`A ...` with no leading moveto is invalid
    // SVG and silently fails to render.
    const events = [event({ id: 1 }), event({ id: 2 }), event({ id: 3 })];
    const segment = buildSegment(events, 2, 100, 0);
    expect(segment.startsWith("M ")).toBe(true);
  });

  it("the first event's segment is just its own arc", () => {
    const segment = buildSegment([event({ id: 1 })], 0, 100, 0);
    expect(segment.startsWith("M ")).toBe(true);
    expect(segment.match(/A /g)).toHaveLength(1);
  });

  it("returns an empty string for an out-of-range index", () => {
    expect(buildSegment([event({ id: 1 })], 5, 100, 0)).toBe("");
  });
});

describe("findBreakIndex / buildBrokenThread", () => {
  it("finds the first failing event", () => {
    const events = [event({ id: 1 }), event({ id: 2, status: "fail" }), event({ id: 3, status: "fail" })];
    expect(findBreakIndex(events)).toBe(1);
  });

  it("returns undefined when nothing failed", () => {
    expect(findBreakIndex([event({ id: 1 }), event({ id: 2 })])).toBeUndefined();
  });

  it("splits into a settled 'above' and a fresh, gap-offset 'below' (§5.5)", () => {
    const events = [event({ id: 1 }), event({ id: 2, status: "fail" }), event({ id: 3 }), event({ id: 4 })];
    const breakIndex = findBreakIndex(events);
    expect(breakIndex).toBe(1);
    const { above, below } = buildBrokenThread(events, breakIndex as number, 100, 0);
    expect(above.match(/A /g)).toHaveLength(2); // events 0..1
    expect(below.match(/A /g)).toHaveLength(2); // events 2..3
    expect(below.startsWith("M ")).toBe(true); // a genuinely new path, not a continuation
  });
});
