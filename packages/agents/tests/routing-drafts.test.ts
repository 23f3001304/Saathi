import { describe, expect, it } from "vitest";

import type {
  Draft,
  DraftScope,
  DraftSink,
} from "../src/providers/turn-stream.js";
import { SILENT_DRAFT } from "../src/providers/turn-stream.js";
import { ESCALATED_AWAY } from "../src/providers/attempt-drafts.js";
import { capabilitiesFor } from "../src/routing/capability-table.js";
import type { CatalogModel } from "../src/routing/model-catalog.js";
import { StaticCatalogSource } from "../src/routing/model-catalog.js";
import {
  DEFAULT_ROUTER_CONFIG,
  ModelRouter,
} from "../src/routing/model-router.js";
import { InMemoryRouterStats } from "../src/routing/outcome-stats.js";
import type { RoutingDecision } from "../src/routing/router-audit.js";
import { RoutedAgentSession } from "../src/routing/routed-agent-session.js";
import type { AgentSession } from "../src/shared/agent-session.js";

function modelOf(id: string): CatalogModel {
  return {
    provider: "openai",
    id,
    capabilities: capabilitiesFor("openai", id),
    source: "manifest",
  };
}

const LADDER = ["gpt-5.6-luna", "gpt-5.6-terra"].map(modelOf);

/** Three hedges saturate the language signal, which is the only one a plain
 *  prose turn produces — so this answer scores zero and the router climbs. */
const HEDGED = "I think it might be right, possibly, but I am not sure.";

const CONFIDENT = "Navy running shoes, UK 8, refundable, under four thousand.";

interface Recorded {
  readonly id: string;
  text: string;
  verdict: "open" | "settled" | string;
}

function recordingSink(): { readonly drafts: Recorded[]; sink: DraftSink } {
  const drafts: Recorded[] = [];
  return {
    drafts,
    sink: {
      open: (): Draft => {
        const held: Recorded = {
          id: `d${drafts.length + 1}`,
          text: "",
          verdict: "open",
        };
        drafts.push(held);
        return {
          id: held.id,
          delta: (text) => {
            held.text += text;
          },
          settle: () => {
            held.verdict = "settled";
          },
          withdraw: (reason) => {
            held.verdict = reason;
          },
        };
      },
    },
  };
}

/** A session that writes its answer a word at a time, like a real adapter:
 *  one draft per round trip, settled when the round trip returns. */
function sessionSaying(text: string, drafts: DraftScope | null): AgentSession {
  return {
    turn: async () => {
      const draft = drafts?.open() ?? SILENT_DRAFT;
      for (const word of text.split(/(?<= )/)) {
        draft.delta(word);
      }
      draft.settle();
      return { text, toolRequests: [], done: true };
    },
    close: async () => {},
  };
}

function harness(sink: DraftSink | null, answers: readonly string[]) {
  let attempt = 0;
  const decisions: RoutingDecision[] = [];
  const session = new RoutedAgentSession(
    new ModelRouter(
      new StaticCatalogSource(LADDER),
      new InMemoryRouterStats(),
      { record: (decision) => void decisions.push(decision) },
      DEFAULT_ROUTER_CONFIG,
    ),
    {
      build: (_model, drafts) => {
        const text = answers[Math.min(attempt, answers.length - 1)] ?? "";
        attempt += 1;
        return { session: sessionSaying(text, drafts), guard: null };
      },
    },
    { tools: [], requiresStructuredOutput: false, sink },
  );
  return { session, decisions };
}

/**
 * Streaming must not become a way to leave an answer the harness threw away on
 * the shopper's screen. The confidence score is unchanged — it still reads the
 * finished text — so the rung that failed it is exactly the rung whose draft is
 * taken back, by name and with a reason.
 */
describe("an escalation takes its discarded answer back", () => {
  it("withdraws the low-confidence draft and settles the one that was kept", async () => {
    const recorder = recordingSink();
    const { session, decisions } = harness(recorder.sink, [HEDGED, CONFIDENT]);

    const turn = await session.turn({ userMessage: "shoes", toolResults: [] });

    expect(turn.text).toBe(CONFIDENT);
    expect(decisions[0]?.escalations).toBe(1);
    expect(recorder.drafts).toEqual([
      { id: "d1", text: HEDGED, verdict: ESCALATED_AWAY },
      { id: "d2", text: CONFIDENT, verdict: "settled" },
    ]);
  });

  it("settles the only draft when the first rung is trusted", async () => {
    const recorder = recordingSink();
    const { session, decisions } = harness(recorder.sink, [CONFIDENT]);

    await session.turn({ userMessage: "shoes", toolResults: [] });

    expect(decisions[0]?.escalations).toBe(0);
    expect(recorder.drafts).toEqual([
      { id: "d1", text: CONFIDENT, verdict: "settled" },
    ]);
  });

  it("routes identically with nobody watching the stream", async () => {
    const watched = harness(recordingSink().sink, [HEDGED, CONFIDENT]);
    const blind = harness(null, [HEDGED, CONFIDENT]);

    await watched.session.turn({ userMessage: "shoes", toolResults: [] });
    await blind.session.turn({ userMessage: "shoes", toolResults: [] });

    expect(blind.decisions[0]?.attempts).toEqual(
      watched.decisions[0]?.attempts,
    );
  });
});

describe("a pinned session keeps streaming", () => {
  it("opens a fresh draft for each later turn and settles it", async () => {
    const recorder = recordingSink();
    const { session } = harness(recorder.sink, [CONFIDENT]);

    await session.turn({ userMessage: "shoes", toolResults: [] });
    await session.turn({ userMessage: null, toolResults: [] });

    expect(recorder.drafts.map((draft) => draft.verdict)).toEqual([
      "settled",
      "settled",
    ]);
  });
});
