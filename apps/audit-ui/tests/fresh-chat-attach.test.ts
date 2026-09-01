// @vitest-environment node
//
// A new chat opened onto somebody else's finished purchase. agent-host keeps
// the last run's beats after it ends, and the client attached at beat zero, so
// the whole transcript replayed into an empty conversation the instant the page
// loaded — no greeting, no first question, eighteen beats already on the paper.
import { afterEach, describe, expect, it, vi } from "vitest";

import { attach, newSession, stop } from "../src/conversation/agentStream.ts";
import type { AssistantSignal } from "../src/conversation/assistantTransport.ts";

const BASE = "http://host.invalid";

const BEATS = [
  { offsetMs: 0, kind: "message", text: "Looking at the catalog." },
  { offsetMs: 10, kind: "message", text: "Here is what I would sign." },
  { offsetMs: 20, kind: "message", text: "Your bill is ready." },
];

type StateBody = { running: boolean; awaiting: readonly string[] };

/** `/chat/state` is the only endpoint this exercise needs; everything else on
 *  the wire is a stream the node runtime has no `EventSource` for. */
function stubHost(body: StateBody): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!url.includes("/chat/state")) throw new Error(`unexpected ${url}`);
      return new Response(JSON.stringify({ beats: BEATS, ...body }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

/** Node has no `EventSource`, so `attach` lands on the polling half; the first
 *  drain is a tick or two behind the call that started it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1)
    await new Promise((resolve) => setTimeout(resolve, 5));
}

async function attachAndCollect(body: StateBody): Promise<AssistantSignal[]> {
  stubHost(body);
  const seen: AssistantSignal[] = [];
  const session = newSession((signal) => seen.push(signal), BASE);
  await attach(session);
  await settle();
  stop(session);
  return seen;
}

function saidLines(signals: readonly AssistantSignal[]): string[] {
  return signals.flatMap((s) => (s.kind === "say" ? [s.text] : []));
}

describe("attaching a fresh chat to a host that has already run", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not replay a finished run into an empty conversation", async () => {
    const signals = await attachAndCollect({ running: false, awaiting: [] });
    expect(saidLines(signals)).toEqual([]);
  });

  it("adopts a run that is still in flight, so a reload rejoins it", async () => {
    const signals = await attachAndCollect({ running: true, awaiting: [] });
    expect(saidLines(signals)).toContain("Your bill is ready.");
  });

  it("adopts a run stopped at a signature, which is the same run", async () => {
    const signals = await attachAndCollect({
      running: false,
      awaiting: ["cart"],
    });
    expect(saidLines(signals)).toContain("Your bill is ready.");
  });
});
