// @vitest-environment node
//
// Reloading used to restore the words and lose the run. The host writes its
// beats down now, and `GET /chat/history` hands them back — so a client that
// was not there folds the identical conversation, cards and browser actions
// and all, through the identical fold.
import { afterEach, describe, expect, it, vi } from "vitest";

import { reduceSignals } from "../src/conversation/assistantState.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";
import { liveTransport } from "../src/conversation/liveTransport.ts";
import type { Host } from "./support/beatHistory.ts";
import {
  BASE,
  CHAT,
  FINISHED,
  replayed,
  stubHost,
} from "./support/beatHistory.ts";

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
}

async function openChat(host: Host): Promise<AssistantSignal[]> {
  stubHost(host);
  const seen: AssistantSignal[] = [];
  const stop = liveTransport(BASE, CHAT).start((signal) => seen.push(signal));
  await settle();
  stop();
  return seen;
}

function transcript(signals: readonly AssistantSignal[]): string[] {
  return reduceSignals(signals).entries.flatMap((entry) =>
    entry.kind === "buyer" || entry.kind === "agent"
      ? [`[${entry.kind}] ${entry.text}`]
      : [],
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a conversation reconstructed from the log", () => {
  it("brings back both halves of the dialogue, in order", async () => {
    expect(transcript(await openChat(FINISHED))).toEqual([
      "[buyer] Shoes?",
      "[agent] Two fit.",
    ]);
  });

  it("brings back the option cards and the cart pill, not just the words", async () => {
    const state = reduceSignals(await openChat(FINISHED));
    expect(state.options.map((option) => option.title)).toEqual([
      "Kolam Road 2",
    ]);
    expect(state.entries.some((entry) => entry.kind === "offer")).toBe(true);
    const pills = state.entries.flatMap((entry) =>
      entry.kind === "work" ? entry.activities.map((a) => a.text) : [],
    );
    expect(pills.join(" | ")).toContain("Cart built");
  });

  it("brings back the sandbox card with its actions and no picture", async () => {
    const restored = reduceSignals(await openChat(FINISHED)).sandbox;
    expect(restored?.actions.map((action) => action.label)).toEqual([
      "Opened amazon.in",
      "Refused to type the password",
    ]);
    expect(JSON.stringify(restored)).not.toContain("png");
    expect(JSON.stringify(restored)).not.toContain("frame");
  });
});

describe("the seam between what was restored and what is live", () => {
  it("shows a beat once when it is both restored and replayed", async () => {
    const signals = await openChat({
      ...FINISHED,
      running: true,
      live: replayed({
        offsetMs: 5,
        kind: "message",
        text: "Your bill is ready.",
      }),
    });
    expect(transcript(signals)).toEqual([
      "[buyer] Shoes?",
      "[agent] Two fit.",
      "[agent] Your bill is ready.",
    ]);
  });

  it("does not skip the tail of a finished run this conversation owns", async () => {
    const signals = await openChat({
      ...FINISHED,
      live: replayed({ offsetMs: 5, kind: "message", text: "That is done." }),
    });
    expect(transcript(signals).at(-1)).toBe("[agent] That is done.");
  });

  it("falls back to the dialogue when the log has nothing for this chat", async () => {
    const signals = await openChat({
      lines: [
        { speaker: "user", text: "Shoes?" },
        { speaker: "agent", text: "Two fit." },
      ],
      stored: [],
      cursor: null,
      live: [],
      running: false,
    });
    expect(transcript(signals)).toEqual(["[buyer] Shoes?", "[agent] Two fit."]);
  });
});
