// The recogniser calls an utterance final when the microphone goes quiet.
// "I want running shoes and" is final by that measure and obviously unfinished
// to anyone listening — and hands-free voice mode would send it and start
// answering over the top of the rest of the sentence.
import { describe, expect, it, vi } from "vitest";

import { heuristicTurnEnd, modelTurnEnd } from "../src/voice/turnEnd.ts";

function replying(word: string): typeof fetch {
  return vi.fn(async () =>
    Response.json({ choices: [{ message: { content: word } }] }),
  ) as unknown as typeof fetch;
}

describe("the floor, with no model reachable", () => {
  const floor = heuristicTurnEnd();

  it("waits when the sentence ends on a conjunction", async () => {
    expect(await floor.complete("I want running shoes and")).toBe(false);
  });

  it("waits through a filler", async () => {
    expect(await floor.complete("umm")).toBe(false);
  });

  it("sends a sentence that stands on its own", async () => {
    expect(await floor.complete("a navy kurta under 2000 rupees")).toBe(true);
  });

  it("never holds an empty transcript open", async () => {
    expect(await floor.complete("   ")).toBe(false);
  });
});

describe("the model, with the floor underneath it", () => {
  it("takes DONE from the model over the floor's guess", async () => {
    vi.stubGlobal("fetch", replying("DONE"));
    expect(await modelTurnEnd("k").complete("show me")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("takes MORE from the model over the floor's guess", async () => {
    vi.stubGlobal("fetch", replying("MORE"));
    const done = await modelTurnEnd("k").complete("a navy kurta under 2000");
    expect(done).toBe(false);
    vi.unstubAllGlobals();
  });

  it("falls to the floor when the call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const detector = modelTurnEnd("k");
    expect(await detector.complete("I want running shoes and")).toBe(false);
    expect(await detector.complete("size L")).toBe(true);
    vi.unstubAllGlobals();
  });

  it("falls to the floor on an answer it cannot read", async () => {
    vi.stubGlobal("fetch", replying("perhaps?"));
    expect(await modelTurnEnd("k").complete("size L")).toBe(true);
    vi.unstubAllGlobals();
  });
});
