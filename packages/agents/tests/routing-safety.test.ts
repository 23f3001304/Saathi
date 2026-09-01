import { describe, expect, it } from "vitest";

import { F2_BLOCK_REASON } from "../src/buyer/pre-tool-use-hook.js";
import { GuardedToolDispatcher } from "../src/providers/guarded-tool-dispatcher.js";
import { OpenAiAgentSession } from "../src/providers/openai-agent-session.js";
import { JsonTransport } from "../src/providers/provider-transport.js";
import { COVENANT_TOOL_DECLARATIONS } from "../src/providers/tool-declarations.js";
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
import { RecordingDispatcher } from "./doubles.js";
import { RecordingSink } from "./fakes.js";
import { hookOf } from "./provider-cases.js";

/** F2: a money tool arriving on the merchant server, never the gateway's. */
const FORBIDDEN_CALL = "mcp__covenant_merchant__execute_payment";

function modelOf(id: string): CatalogModel {
  return {
    provider: "openai",
    id,
    capabilities: capabilitiesFor("openai", id),
    source: "manifest",
  };
}

const LADDER = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"].map(modelOf);

function body(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Every model on the ladder tries the same forbidden call, then answers. */
function scriptedFetch(): typeof fetch {
  let call = 0;
  const impl = async (): Promise<Response> => {
    const turn = call;
    call += 1;
    if (turn % 2 === 0) {
      return body({
        output: [
          {
            type: "function_call",
            call_id: `call_${turn}`,
            name: FORBIDDEN_CALL,
            arguments: "{}",
          },
        ],
      });
    }
    return body({
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "The payment did not run." }],
        },
      ],
    });
  };
  return impl as typeof fetch;
}

function harness() {
  const sink = new RecordingSink();
  const dispatcher = new RecordingDispatcher();
  const guard = new GuardedToolDispatcher(hookOf(sink), dispatcher, "txn_1");
  const decisions: RoutingDecision[] = [];
  const router = new ModelRouter(
    new StaticCatalogSource(LADDER),
    new InMemoryRouterStats(),
    { record: (decision) => void decisions.push(decision) },
    DEFAULT_ROUTER_CONFIG,
  );
  const session = new RoutedAgentSession(
    router,
    {
      build: (model) => ({
        session: new OpenAiAgentSession(
          guard,
          new JsonTransport(scriptedFetch(), {
            provider: "openai",
            timeoutMs: 1_000,
          }),
          {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-test",
            model: model.id,
            systemPrompt: "You are the buyer agent.",
            tools: COVENANT_TOOL_DECLARATIONS,
            maxToolIterations: 4,
          },
        ),
        guard,
      }),
    },
    { tools: COVENANT_TOOL_DECLARATIONS, requiresStructuredOutput: false },
  );
  return { session, guard, dispatcher, sink, decisions };
}

/**
 * The non-negotiable property: model choice must never change what is allowed.
 * The router escalates the whole ladder here, so the same forbidden call is made
 * by three different models — and is refused three times, with the same reason,
 * by the one `PreToolUseHook` every rung was handed.
 */
describe("escalation cannot widen authority", () => {
  it("blocks the same money call on every rung of the ladder", async () => {
    const { session, guard, dispatcher, decisions } = harness();
    await session.turn({
      userMessage: "search the catalog for a brass lamp",
      toolResults: [],
    });

    expect(decisions[0]?.escalations).toBe(2);
    expect(decisions[0]?.candidates).toHaveLength(3);
    expect(guard.blocked).toHaveLength(3);
    for (const decision of guard.blocked) {
      expect(decision.allowed).toBe(false);
      expect(decision.moneyAffecting).toBe(true);
      expect(decision.reason).toBe(F2_BLOCK_REASON);
    }
    expect(dispatcher.calls).toEqual([]);
  });

  it("ledgers one block per rung, so the record survives the escalation", async () => {
    const { session, sink } = harness();
    await session.turn({ userMessage: "search the catalog", toolResults: [] });
    const blocked = sink.events.filter(
      (event) => event.kind === "tool.call.blocked",
    );
    expect(blocked).toHaveLength(3);
    expect(
      sink.events.some((event) => event.kind === "tool.call.allowed"),
    ).toBe(false);
  });
});

describe("the refusal reaches the model", () => {
  it("tells the model the call did not happen, on every rung", async () => {
    const { session } = harness();
    const turn = await session.turn({
      userMessage: "search the catalog",
      toolResults: [],
    });
    expect(turn.text).toContain("The payment did not run.");
    expect(turn.toolRequests).toEqual([]);
  });

  /** A structural guard, not a behavioural one: the router's output contract
   *  has no field through which a rung could carry extra authority. If someone
   *  adds `allowedTools` or `capPaise` to a routing decision, this fails. */
  it("carries no capability, cap or tool field in its decision record", async () => {
    const { session, decisions } = harness();
    await session.turn({ userMessage: "search the catalog", toolResults: [] });
    expect(Object.keys(decisions[0] ?? {}).sort()).toEqual([
      "attempts",
      "candidates",
      "capped",
      "chosen",
      "escalations",
      "features",
      "taskClass",
      "threshold",
    ]);
  });
});
