// The work strip half of a streamed turn. `streamed-answer.test.ts` pins what
// a draft does to the bubble; this pins what it does when it turns out not to
// be the answer at all — which, on a browsing turn, is most of them.
import { describe, expect, it } from "vitest";

import type { AgentBeat } from "../src/api/agentBeat.ts";
import {
  emptySnapshot,
  reduceSignals,
  type AssistantSnapshot,
  type ChatEntry,
} from "../src/conversation/assistantState.ts";
import { signalsForBeats } from "../src/conversation/beatSignals.ts";

function delta(streamId: string, text: string): AgentBeat {
  return { offsetMs: 0, kind: "delta", streamId, text };
}

function fold(beats: readonly AgentBeat[]): AssistantSnapshot {
  return reduceSignals(signalsForBeats(beats, 1), emptySnapshot);
}

function agents(state: AssistantSnapshot): ChatEntry[] {
  return state.entries.filter((entry) => entry.kind === "agent");
}

function pills(state: AssistantSnapshot): string[] {
  return state.entries.flatMap((entry) =>
    entry.kind === "work" ? entry.activities.map((a) => a.text) : [],
  );
}

const TOUR: readonly AgentBeat[] = [
  delta("d6", "What will you use the SSD for?"),
  { offsetMs: 0, kind: "draft-withdrawn", streamId: "d6", reason: "" },
  delta("d7", "I'm opening Amazon and searching for SSDs now."),
  { offsetMs: 0, kind: "draft-withdrawn", streamId: "d7", reason: "" },
  delta("d8", "Amazon's home page did not expose its search box."),
  { offsetMs: 0, kind: "draft-withdrawn", streamId: "d8", reason: "" },
  delta("d9", "I searched Amazon's SSD results page: Samsung 990 PRO 1TB."),
  { offsetMs: 0, kind: "draft-settled", streamId: "d9" },
];

/**
 * The bug this pins: a browsing turn opens a draft per tool round, and every
 * round's draft superseded the last one *in the same bubble* — one shopper
 * watched "what will you use the SSD for?" become "I'm checking Amazon"
 * become a search result, six rewrites of one sentence. The superseded prose
 * is a true record of what the run was doing, so it belongs in the work strip.
 */
describe("a superseded draft moves to the work strip", () => {
  it("leaves one bubble and a list, not six rewrites of one sentence", () => {
    const state = fold([
      ...TOUR,
      { offsetMs: 0, kind: "message", text: "I found the Samsung 990 PRO." },
    ]);

    expect(agents(state).map((entry) => entry.text)).toEqual([
      "I found the Samsung 990 PRO.",
    ]);
    expect(pills(state)).toEqual([
      "What will you use the SSD for?",
      "I'm opening Amazon and searching for SSDs now.",
      "Amazon's home page did not expose its search box.",
    ]);
  });

  it("keeps the record in one strip rather than one strip per round", () => {
    const work = fold(TOUR).entries.filter((entry) => entry.kind === "work");
    expect(work).toHaveLength(1);
  });
});

/**
 * The live host produces both shapes in one turn — it withdrew two drafts and
 * settled four more, and every one of the six reached the bubble. A settled
 * draft nothing was spoken for, written past by the next round, is the same
 * fact as a withdrawn one and is folded the same way.
 */
describe("a settled draft the next round wrote past", () => {
  it("goes to the strip too, so the bubble is left for the answer", () => {
    const state = fold([
      delta("d5", "I'm opening Amazon, then I'll search its own shop."),
      { offsetMs: 0, kind: "draft-settled", streamId: "d5" },
      delta("d8", "Amazon's page moved during the search."),
      { offsetMs: 0, kind: "draft-settled", streamId: "d8" },
      { offsetMs: 0, kind: "message", text: "I found the Samsung 990 PRO." },
    ]);

    expect(agents(state).map((entry) => entry.text)).toEqual([
      "I found the Samsung 990 PRO.",
    ]);
    expect(pills(state)).toEqual([
      "I'm opening Amazon, then I'll search its own shop.",
    ]);
  });

  /** The spoken bubble is an answer, not a preamble, and a later round's
   *  draft opens under it rather than sweeping it into the strip. */
  it("leaves a bubble a message already claimed where it is", () => {
    const said = "I'm checking Amazon for SSD options now.";
    const state = fold([
      delta("d3", said),
      { offsetMs: 0, kind: "draft-settled", streamId: "d3" },
      { offsetMs: 0, kind: "message", text: said },
      delta("d5", "Opening the results page."),
      { offsetMs: 0, kind: "draft-settled", streamId: "d5" },
      { offsetMs: 0, kind: "message", text: "Here it is." },
    ]);

    expect(agents(state).map((entry) => entry.text)).toEqual([
      said,
      "Here it is.",
    ]);
    expect(pills(state)).toEqual([]);
  });
});
