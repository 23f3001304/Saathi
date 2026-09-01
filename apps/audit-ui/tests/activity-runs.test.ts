// A live run wrote the same rejection ten times in a row and the chat showed
// ten identical pills — one fact about how the write gate behaves, rendered as
// a wall. Folding keeps every occurrence and stops the repetition reading as
// ten separate events.
import { describe, expect, it } from "vitest";

import { groupRuns } from "../src/conversation/activityRuns.ts";

const REJECTED = "Memory rejected at P0 · R0.tier-permission";

function act(id: string, text: string): {
  id: string;
  text: string;
  afterMs: number;
} {
  return { id, text, afterMs: 0 };
}

describe("folding a run of identical activities", () => {
  it("folds consecutive repeats into one row that keeps them all", () => {
    const runs = groupRuns([
      act("a", REJECTED),
      act("b", REJECTED),
      act("c", REJECTED),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.members).toHaveLength(3);
    expect(runs[0]?.text).toBe(REJECTED);
  });

  it("does not fold across a different line between two repeats", () => {
    const runs = groupRuns([
      act("a", REJECTED),
      act("b", "Memory committed at P2"),
      act("c", REJECTED),
    ]);
    expect(runs.map((r) => r.members.length)).toEqual([1, 1, 1]);
  });

  it("leaves a stream with nothing repeated exactly as it was", () => {
    const activities = [act("a", "one"), act("b", "two"), act("c", "three")];
    expect(groupRuns(activities).map((r) => r.text)).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("loses nothing: every activity is still present after folding", () => {
    const activities = [
      act("a", REJECTED),
      act("b", REJECTED),
      act("c", "Sorted by verified price"),
    ];
    const kept = groupRuns(activities).flatMap((r) => r.members);
    expect(kept).toEqual(activities);
  });
});
