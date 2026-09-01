import { describe, expect, it } from "vitest";

import { BeatHub } from "../src/http/beat-hub.js";
import type { BeatSink } from "../src/http/beat-hub.js";
import type { ChatBeat } from "../src/http/chat-beat.js";
import { BeatDraftSink } from "../src/purchase/draft-beats.js";
import { RecordingLogger, StepClock } from "./support/fakes.js";

interface Reader {
  readonly sink: BeatSink;
  /** Every beat this client was handed, with the index it arrived under. */
  readonly seen: { index: number; beat: ChatBeat }[];
  readonly text: () => string;
  readonly cursor: () => number;
}

/**
 * A client, exactly as strict as the real one: it drops anything at or below
 * the highest index it already holds, which is how the browser's `feed` works.
 */
function reader(): Reader {
  const seen: { index: number; beat: ChatBeat }[] = [];
  let high = 0;
  return {
    seen,
    cursor: () => high,
    text: () =>
      seen.map(({ beat }) => (beat.kind === "delta" ? beat.text : "")).join(""),
    sink: {
      deliver: (_epoch, index, beat) => {
        if (index <= high) return;
        high = index;
        seen.push({ index, beat });
      },
      rebase: () => {
        high = 0;
      },
      close: () => {},
    },
  };
}

function hubOf(): BeatHub {
  return new BeatHub(new StepClock(), new RecordingLogger());
}

const SENTENCE = [
  "Navy running ",
  "shoes in UK 8, ",
  "refundable, under ",
  "four thousand.",
];

/**
 * The property streaming has to hold or it is not worth having: a browser that
 * drops mid-sentence and comes back must end with the same words as one that
 * never dropped. It holds because a fragment is an ordinary beat on the
 * ordinary log — the hub's `(epoch, index)` replay is the whole mechanism, and
 * there is no second path a fragment can take.
 */
describe("a reconnect mid-sentence lands on the same text", () => {
  it("replays exactly the fragments a client missed, and no others", () => {
    const hub = hubOf();
    const drafts = new BeatDraftSink(hub);
    const throughout = reader();
    hub.subscribe(throughout.sink, { after: 0, epoch: null, transport: "sse" });

    const draft = drafts.open();
    draft.delta(SENTENCE[0] ?? "");
    draft.delta(SENTENCE[1] ?? "");
    // The client drops here, holding whatever it had at this instant.
    const dropped = throughout.cursor();
    draft.delta(SENTENCE[2] ?? "");
    draft.delta(SENTENCE[3] ?? "");
    draft.settle();

    const rejoined = reader();
    hub.subscribe(rejoined.sink, {
      after: dropped,
      epoch: hub.epoch,
      transport: "socket",
    });

    expect(throughout.text()).toBe(SENTENCE.join(""));
    expect(rejoined.text() && throughout.text().endsWith(rejoined.text())).toBe(
      true,
    );
    // No fragment arrives twice and none is skipped: the two accounts of the
    // run, concatenated at the drop, are the run.
    const before = throughout.seen
      .filter(({ index }) => index <= dropped)
      .map(({ beat }) => (beat.kind === "delta" ? beat.text : ""))
      .join("");
    expect(before + rejoined.text()).toBe(SENTENCE.join(""));
  });
});

describe("a late client is given the run so far", () => {
  it("gives a client that attaches from zero the whole sentence", () => {
    const hub = hubOf();
    const drafts = new BeatDraftSink(hub);
    const draft = drafts.open();
    for (const fragment of SENTENCE) {
      draft.delta(fragment);
    }
    draft.settle();

    const late = reader();
    hub.subscribe(late.sink, { after: 0, epoch: null, transport: "sse" });

    expect(late.text()).toBe(SENTENCE.join(""));
    expect(late.seen.at(-1)?.beat.kind).toBe("draft-settled");
  });
});

describe("a cursor from a finished run", () => {
  it("rebases a cursor from a run that no longer exists", () => {
    const hub = hubOf();
    const first = new BeatDraftSink(hub).open();
    first.delta("from the run before. ");
    first.settle();

    hub.restart();
    const second = new BeatDraftSink(hub).open();
    second.delta("this run only.");
    second.settle();

    const stale = reader();
    hub.subscribe(stale.sink, { after: 9, epoch: 1, transport: "socket" });

    expect(stale.text()).toBe("this run only.");
  });
});

describe("a draft that never streamed says nothing", () => {
  it("writes no beat for a provider on the blocking path", () => {
    const hub = hubOf();
    const draft = new BeatDraftSink(hub).open();
    draft.settle();

    expect(hub.snapshot()).toEqual([]);
  });

  it("drops the held tail of a withdrawn draft rather than flushing it", () => {
    const hub = hubOf();
    const draft = new BeatDraftSink(hub).open();
    draft.delta("kept words then ");
    draft.delta("a tail nobody sees");
    draft.withdraw("it was not trusted");

    const kinds = hub.snapshot().map((beat) => beat.kind);
    expect(kinds.at(-1)).toBe("draft-withdrawn");
    const streamed = hub
      .snapshot()
      .map((beat) => (beat.kind === "delta" ? beat.text : ""))
      .join("");
    expect(streamed).not.toContain("sees");
  });
});
