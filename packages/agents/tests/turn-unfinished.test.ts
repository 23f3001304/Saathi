// A turn that ran out of round trips is not an answer, and a merchant refusal
// that cannot change is not worth another round trip. A live `/chat` turn burnt
// its whole budget re-asking for a SKU the shelf did not carry: sixteen drafts,
// each superseding the last, no card, no draft, and the final speculative
// sentence left standing as though it were the reply.
import type { ToolDispatcher, ToolOutcome } from "@covenant/agents";
import { describe, expect, it } from "vitest";

import { GuardedToolDispatcher } from "../src/providers/guarded-tool-dispatcher.js";
import type { ProviderExchange } from "../src/providers/provider-turn-loop.js";
import { runGuardedTurn } from "../src/providers/provider-turn-loop.js";
import type { AgentSession } from "../src/shared/agent-session.js";
import { BROWSE_TOOL, BUYER_TOOL_SERVER } from "../src/buyer/turn-plan.js";
import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";
import { SessionTurnPlanner, WRAP_UP_NOTE } from "../src/buyer/turn-planner.js";
import { RecordingLogger, RecordingSink } from "./fakes.js";
import { hookOf } from "./provider-cases.js";

const QUOTE_CALL = {
  toolUseId: "call_1",
  tool: "quote_request",
  server: "covenant_merchant",
  args: {},
};

/** `varying` asks something new each round; otherwise it repeats itself. */
class AlwaysCalls implements ProviderExchange {
  rounds = 0;

  constructor(private readonly varying = true) {}

  appendUser(): void {}

  appendToolResults(): void {}

  send(): Promise<{ text: string; toolRequests: (typeof QUOTE_CALL)[] }> {
    this.rounds += 1;
    return Promise.resolve({
      text: `round ${this.rounds}`,
      toolRequests: [
        { ...QUOTE_CALL, args: this.varying ? { round: this.rounds } : {} },
      ],
    });
  }

  reset(): void {}
}

class Refusing implements ToolDispatcher {
  calls = 0;

  constructor(private readonly terminal: boolean) {}

  dispatch(): Promise<ToolOutcome> {
    this.calls += 1;
    return Promise.resolve({
      content: JSON.stringify({ ok: false, failure: "not_stocked" }),
      isError: true,
      ...(this.terminal ? { terminal: true } : {}),
    });
  }
}

function loopOver(terminal: boolean, varying = true) {
  const dispatcher = new Refusing(terminal);
  const guard = new GuardedToolDispatcher(
    hookOf(new RecordingSink()),
    dispatcher,
    null,
  );
  const exchange = new AlwaysCalls(varying);
  return { dispatcher, exchange, guard };
}

describe("a refusal that cannot change ends the round", () => {
  it("stops after the first structural refusal", async () => {
    const { dispatcher, exchange, guard } = loopOver(true);

    const turn = await runGuardedTurn(exchange, guard, INPUT, 8);

    expect(dispatcher.calls).toBe(1);
    expect(exchange.rounds).toBe(1);
    expect(turn.done).toBe(true);
  });

  it("still spends the whole budget while the model asks something new", async () => {
    const { dispatcher, exchange, guard } = loopOver(false);

    const turn = await runGuardedTurn(exchange, guard, INPUT, 8);

    expect(dispatcher.calls).toBe(8);
    expect(turn.done).toBe(false);
  });
});

describe("asking the same thing twice is not progress", () => {
  it("ends the round rather than rewriting the same draft again", async () => {
    const { dispatcher, exchange, guard } = loopOver(false, false);

    const turn = await runGuardedTurn(exchange, guard, INPUT, 8);

    expect(dispatcher.calls).toBe(2);
    expect(exchange.rounds).toBe(2);
    expect(turn.done).toBe(true);
  });
});

const INPUT = { userMessage: "buy the kurta", toolResults: [] };

const WRAPPED = "I was still comparing two kurtas; give me one more go.";

/** A session whose first turn spends its budget mid-sentence, and whose next
 *  turn (the wrap-up) answers in one line. */
class Unfinished {
  readonly asked: string[] = [];

  constructor(
    private readonly draft: string,
    private readonly wrapped: string | Error = "",
    /** Set to have the wrap-up call a tool, as a real session's would. */
    private readonly stray: TurnPlanCollector | null = null,
  ) {}

  async turn(input: { userMessage: string | null }) {
    this.asked.push(input.userMessage ?? "");
    if (this.asked.length === 1) {
      return { text: this.draft, toolRequests: [], done: false };
    }
    if (this.wrapped instanceof Error) throw this.wrapped;
    await this.stray?.dispatch({
      tool: BROWSE_TOOL,
      server: BUYER_TOOL_SERVER,
      args: {},
    });
    return { text: this.wrapped, toolRequests: [], done: true };
  }

  close() {
    return Promise.resolve();
  }
}

function plannerOver(
  session: AgentSession,
  collector = new TurnPlanCollector(),
) {
  return new SessionTurnPlanner(session, collector, new RecordingLogger());
}

describe("an unfinished turn does not pass for an answer", () => {
  it("asks the model to wrap up, and says what the model then says", async () => {
    const session = new Unfinished("There's a navy kurta under…", WRAPPED);
    const planner = plannerOver(session);

    const plan = await planner.plan(["a navy kurta under 2000"]);

    expect(plan.action).toBe("answer");
    expect(plan.reply).toBe(WRAPPED);
    expect(session.asked[1]).toBe(WRAP_UP_NOTE);
  });

  it("says nothing at all when even the wrap-up fails", async () => {
    const planner = plannerOver(
      new Unfinished("There's a navy…", new Error("provider unreachable")),
    );

    const plan = await planner.plan(["a navy kurta under 2000"]);

    expect(plan.action).toBe("answer");
    expect(plan.reply).toBe("");
  });

  it("keeps a finished model's own sentence untouched", async () => {
    const finished = {
      turn: () =>
        Promise.resolve({ text: "What size?", toolRequests: [], done: true }),
      close: () => Promise.resolve(),
    };

    expect((await plannerOver(finished).plan(["hi"])).reply).toBe("What size?");
  });
});

describe("a tool called on the wrap-up is not this turn's move", () => {
  it("answers in the wrap-up's words and leaves nothing behind", async () => {
    const collector = new TurnPlanCollector();
    const planner = plannerOver(
      new Unfinished("There's a navy…", WRAPPED, collector),
      collector,
    );

    const plan = await planner.plan(["a navy kurta under 2000"]);

    expect(plan.action).toBe("answer");
    expect(plan.reply).toBe(WRAPPED);
    expect(collector.take()).toBeNull();
  });
});
