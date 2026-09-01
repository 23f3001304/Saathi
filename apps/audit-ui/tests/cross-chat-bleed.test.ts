// @vitest-environment node
//
// The hub is one fan-out for the whole host and its beats carry no
// conversation id, so with the multi-chat shelf a client showing chat B while
// a run from chat A was still streaming folded A's beats — drafts, cards,
// sandbox and all — into B's transcript. Opening "+ New chat" mid-run put the
// old run's work in the fresh one.
//
// `GET /chat/state` now names the conversation the hub's beats belong to. What
// is pinned here is that a named chat adopts only its own, that the answer is
// scoped to the epoch it named, and that a chat with no id of its own still
// folds an anonymous run — the CLI and the single-chat flow depend on it.
import { afterEach, describe, expect, it, vi } from "vitest";

import { reduceSignals } from "../src/conversation/assistantState.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";
import { attach, newSession, stop } from "../src/conversation/agentStream.ts";

const BASE = "http://host.invalid";
const MINE = "cnv_mine";
const THEIRS = "cnv_theirs";

const BEATS = [
  { offsetMs: 0, kind: "message", text: "Here is what I would sign." },
  { offsetMs: 1, kind: "message", text: "Your bill is ready." },
];

type Hub = { conversation: string | null; epoch: number };

/** `/chat/state` is the only route the polling rung needs, and Node has no
 *  `EventSource`, so `attach` lands there. */
function stubHost(hub: Hub): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            beats: BEATS,
            awaiting: [],
            running: true,
            ...hub,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ),
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
}

async function open(chat: string | null, hub: Hub): Promise<AssistantSignal[]> {
  stubHost(hub);
  const seen: AssistantSignal[] = [];
  const session = newSession((signal) => seen.push(signal), BASE, chat);
  await attach(session);
  await settle();
  stop(session);
  return seen;
}

function transcript(signals: readonly AssistantSignal[]): string[] {
  return reduceSignals(signals).entries.flatMap((entry) =>
    entry.kind === "agent" ? [entry.text] : [],
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a chat folding beats the host is fanning out", () => {
  it("refuses a run another conversation started", async () => {
    const seen = await open(MINE, { conversation: THEIRS, epoch: 4 });
    expect(transcript(seen)).toEqual([]);
  });

  it("folds the run it started itself", async () => {
    const seen = await open(MINE, { conversation: MINE, epoch: 4 });
    expect(transcript(seen)).toEqual([
      "Here is what I would sign.",
      "Your bill is ready.",
    ]);
  });

  /**
   * A named chat did not start an anonymous run: the POST that started it
   * would have carried this chat's id. `null` is the CLI, the e2e, or a hub
   * emptied by a restart — none of them this conversation's.
   */
  it("refuses an anonymous run, having not started one", async () => {
    const seen = await open(MINE, { conversation: null, epoch: 4 });
    expect(transcript(seen)).toEqual([]);
  });

  /** Fixture mode and the single-chat flow both run with no id at all. */
  it("lets a chat with no id of its own fold an anonymous run", async () => {
    const seen = await open(null, { conversation: null, epoch: 4 });
    expect(transcript(seen)).toEqual([
      "Here is what I would sign.",
      "Your bill is ready.",
    ]);
  });
});

/**
 * The answer is scoped to the epoch it named. A rebase is a different run,
 * which may be a different conversation, and the streamed frames do not say
 * which — so the ladder asks again rather than carrying the old verdict
 * forward. Here the hub moves from this chat's run to a stranger's.
 */
describe("ownership does not outlive the run it was asked about", () => {
  it("stops folding once the hub moves to another conversation", async () => {
    let hub: Hub = { conversation: MINE, epoch: 4 };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              beats: BEATS,
              awaiting: [],
              running: true,
              ...hub,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const seen: AssistantSignal[] = [];
    const session = newSession((signal) => seen.push(signal), BASE, MINE);
    await attach(session);
    await settle();
    expect(transcript(seen)).toHaveLength(2);

    hub = { conversation: THEIRS, epoch: 5 };
    await settle();
    stop(session);
    // The stranger's two beats did not join this transcript.
    expect(transcript(seen)).toHaveLength(2);
  });
});
