// Rolling compaction of the dialogue the planner reads: the tail stays
// verbatim because "yes" needs its antecedent word for word, everything older
// folds into one stored line, and nothing is ever folded twice.
import { describe, expect, it } from "vitest";

import {
  foldInto,
  SUMMARY_CEILING,
  TAIL_KEPT,
  unfolded,
} from "../src/purchase/dialogue-compaction.js";
import type { Turn } from "../src/purchase/dialogue.js";

function at(index: number): string {
  return new Date(Date.parse("2026-08-31T09:00:00Z") + index * 1000)
    .toISOString();
}

function chat(count: number): Turn[] {
  return Array.from({ length: count }, (_, index) => ({
    speaker: index % 2 === 0 ? ("user" as const) : ("agent" as const),
    text: `line number ${index}`,
    at: at(index),
  }));
}

const NOTHING = { summary: null, folded: null };

describe("what folds and what stays verbatim", () => {
  it("keeps the newest TAIL_KEPT lines out of the summary", () => {
    const dialogue = chat(TAIL_KEPT + 6);
    const compacted = foldInto(NOTHING, dialogue);
    const tail = unfolded(dialogue, compacted.folded);
    expect(tail).toHaveLength(TAIL_KEPT);
    expect(tail[0]?.text).toBe("line number 6");
    expect(compacted.summary).toContain("(them) line number 0");
    expect(compacted.summary).toContain("(you) line number 5");
    expect(compacted.summary).not.toContain("line number 6");
  });

  it("folds nothing while the conversation fits in the tail", () => {
    expect(foldInto(NOTHING, chat(TAIL_KEPT))).toBe(NOTHING);
    expect(unfolded(chat(3), null)).toHaveLength(3);
  });
});

describe("stored, never recomputed", () => {
  it("reads a line for folding on exactly one turn of its life", () => {
    const first = foldInto(NOTHING, chat(TAIL_KEPT + 4));
    // The next turn recalls the same lines plus two new ones.
    const second = foldInto(first, chat(TAIL_KEPT + 6));
    expect(second.summary).toContain("line number 0");
    expect(second.summary?.match(/line number 0\b/gu)).toHaveLength(1);
    expect(second.folded).toBe(at(5));
  });

  it("returns the previous record untouched when nothing new is old", () => {
    const first = foldInto(NOTHING, chat(TAIL_KEPT + 4));
    expect(foldInto(first, chat(TAIL_KEPT + 4))).toBe(first);
  });
});

describe("the summary stays a summary", () => {
  it("clamps each folded line and drops the oldest past the ceiling", () => {
    const long = Array.from({ length: 40 }, (_, index) => ({
      speaker: "user" as const,
      text: `wish number ${index} ${"very ".repeat(30)}long`,
      at: at(index),
    }));
    const compacted = foldInto(NOTHING, long);
    expect(compacted.summary?.length).toBeLessThanOrEqual(SUMMARY_CEILING + 1);
    expect(compacted.summary?.startsWith("…")).toBe(true);
    expect(compacted.summary).not.toContain("wish number 0 ");
    expect(compacted.summary).toContain("…");
  });

  it("never splits two lines written in the same instant", () => {
    const paired = chat(TAIL_KEPT + 2).map((line, index) => ({
      ...line,
      // Every pair shares an instant, the way a turn's two halves can.
      at: at(Math.floor(index / 2)),
    }));
    const compacted = foldInto(NOTHING, paired);
    const tail = unfolded(paired, compacted.folded);
    // The boundary moved back to keep the instant whole.
    expect(tail.length % 2).toBe(0);
    const cut = tail[0]?.at ?? "";
    expect(compacted.summary?.includes(cut)).toBe(false);
  });
});
