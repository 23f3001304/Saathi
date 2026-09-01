// The endpointing call costs 400-600 ms, and paying it after the recogniser has
// already waited out the silence makes it serial: stop talking, wait for the
// microphone to give up, wait again for a model to agree you stopped. Asking
// while the shopper is still trailing off makes the common case free.
import { describe, expect, it, vi } from "vitest";

import { createTurnGuess } from "../src/voice/turnGuess.ts";

const SETTLE = 250;

function counting(answer: boolean) {
  const asked: string[] = [];
  return {
    asked,
    detector: {
      complete: async (text: string): Promise<boolean> => {
        asked.push(text);
        return answer;
      },
    },
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("deciding early, while the shopper is still speaking", () => {
  it("has the verdict ready before the utterance goes final", async () => {
    vi.useFakeTimers();
    const { detector } = counting(true);
    const guess = createTurnGuess(detector);
    guess.observe("a navy kurta under 2000");
    await vi.advanceTimersByTimeAsync(SETTLE);
    vi.useRealTimers();
    await flush();
    expect(guess.verdict("A navy kurta under 2000.")).toBe(true);
  });

  it("matches across the punctuation and case a final adds", async () => {
    vi.useFakeTimers();
    const { detector } = counting(false);
    const guess = createTurnGuess(detector);
    guess.observe("i want running shoes and");
    await vi.advanceTimersByTimeAsync(SETTLE);
    vi.useRealTimers();
    await flush();
    expect(guess.verdict("I want running shoes and")).toBe(false);
  });
});

describe("what it declines to spend a call on", () => {
  it("does not ask on every syllable of a steady talker", async () => {
    vi.useFakeTimers();
    const { detector, asked } = counting(true);
    const guess = createTurnGuess(detector);
    for (const partial of ["a navy", "a navy kurta", "a navy kurta under"]) {
      guess.observe(partial);
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(SETTLE);
    vi.useRealTimers();
    await flush();
    expect(asked).toEqual(["a navy kurta under"]);
  });

  it("asks nothing at all about a single word", async () => {
    vi.useFakeTimers();
    const { detector, asked } = counting(true);
    const guess = createTurnGuess(detector);
    guess.observe("umm");
    await vi.advanceTimersByTimeAsync(SETTLE * 4);
    vi.useRealTimers();
    await flush();
    expect(asked).toEqual([]);
  });

  it("knows nothing about words it never heard", () => {
    const guess = createTurnGuess(counting(true).detector);
    expect(guess.verdict("something else entirely")).toBeUndefined();
  });
});
