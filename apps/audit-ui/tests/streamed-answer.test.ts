import { describe, expect, it } from "vitest";

import type { AgentBeat } from "../src/api/agentBeat.ts";
import { parseBeat } from "../src/api/agentBeat.ts";
import {
  emptySnapshot,
  reduceSignals,
  type AssistantSnapshot,
  type ChatEntry,
} from "../src/conversation/assistantState.ts";
import { signalsForBeats } from "../src/conversation/beatSignals.ts";
import { WITHDRAWN_PREFIX } from "../src/conversation/draftEntries.ts";

function delta(streamId: string, text: string): AgentBeat {
  return { offsetMs: 0, kind: "delta", streamId, text };
}

const STREAMED: readonly AgentBeat[] = [
  delta("d1", "Navy running shoes "),
  delta("d1", "in UK 8, refundable, "),
  delta("d1", "under four thousand."),
  { offsetMs: 0, kind: "draft-settled", streamId: "d1" },
];

function fold(
  beats: readonly AgentBeat[],
  from: AssistantSnapshot = emptySnapshot,
  firstIndex = 1,
): AssistantSnapshot {
  return reduceSignals(signalsForBeats(beats, firstIndex), from);
}

function agents(state: AssistantSnapshot): ChatEntry[] {
  return state.entries.filter((entry) => entry.kind === "agent");
}

describe("a streamed answer becomes one bubble", () => {
  it("grows the same bubble as fragments land", () => {
    const state = fold(STREAMED.slice(0, 3));

    expect(agents(state)).toHaveLength(1);
    expect(agents(state)[0]).toMatchObject({
      kind: "agent",
      text: "Navy running shoes in UK 8, refundable, under four thousand.",
    });
  });

  /**
   * The duplicate this exists to prevent: the fragments are the model writing,
   * the `message` beat is the answer the harness judged and stands behind.
   * Both are the same turn, so they are one bubble — the judged text finishes
   * the sentence the shopper was already reading rather than repeating it
   * underneath.
   */
  it("lands the judged text in the bubble the fragments opened", () => {
    const state = fold([
      ...STREAMED,
      { offsetMs: 0, kind: "message", text: "Navy running shoes, UK 8." },
    ]);

    expect(agents(state)).toHaveLength(1);
    expect(agents(state)[0]).toMatchObject({
      text: "Navy running shoes, UK 8.",
    });
  });
});

describe("each turn gets its own bubble", () => {
  it("opens a second bubble for a second turn", () => {
    const first = fold([
      ...STREAMED,
      { offsetMs: 0, kind: "message", text: "Under four thousand." },
    ]);
    const second = reduceSignals(
      [
        { kind: "buyer", text: "yes please" },
        ...signalsForBeats([{ offsetMs: 0, kind: "message", text: "On it." }]),
      ],
      first,
    );

    expect(agents(second).map((entry) => entry.text)).toEqual([
      "Under four thousand.",
      "On it.",
    ]);
  });
});

/**
 * An escalated answer must not be left standing as the one the agent settled
 * on, and must not vanish without a word either — the shopper had already read
 * some of it. The bubble goes and a system line says why.
 */
describe("a withdrawn draft leaves, and says so", () => {
  it("replaces the discarded prose with the reason it went", () => {
    const state = fold([
      ...STREAMED.slice(0, 3),
      {
        offsetMs: 0,
        kind: "draft-withdrawn",
        streamId: "d1",
        reason: "the agent was not confident enough in that answer",
      },
      { offsetMs: 0, kind: "message", text: "Here is a better answer." },
    ]);

    const texts = agents(state).map((entry) => entry.text);
    expect(texts[0]).toBe(
      `${WITHDRAWN_PREFIX}: the agent was not confident enough in that answer.`,
    );
    expect(texts[1]).toBe("Here is a better answer.");
    expect(agents(state)[0]).toMatchObject({ system: true });
  });
});

/**
 * The client half of the reconnect property. A browser that drops mid-sentence
 * folds the beats it already had, then the ones it missed; a browser that
 * never dropped folds the lot. The two must be the same conversation, which
 * they are because the fold is pure and every fragment is index-addressed.
 */
describe("a split replay folds to the same conversation", () => {
  it("matches a client that was connected throughout", () => {
    const whole: readonly AgentBeat[] = [
      ...STREAMED,
      { offsetMs: 0, kind: "message", text: "Navy running shoes, UK 8." },
      {
        offsetMs: 0,
        kind: "outcome",
        state: "answered",
        txnId: null,
        detail: "answer",
      },
    ];
    const throughout = fold(whole);

    const dropped = 2;
    const rejoined = fold(
      whole.slice(dropped),
      fold(whole.slice(0, dropped)),
      dropped + 1,
    );

    expect(rejoined.entries).toEqual(throughout.entries);
  });
});

describe("the wire admits the streamed kinds", () => {
  it("parses a delta beat rather than dropping it", () => {
    expect(parseBeat(delta("d1", "hello "))).not.toBeNull();
    expect(parseBeat({ kind: "not-a-beat" })).toBeNull();
  });
});
