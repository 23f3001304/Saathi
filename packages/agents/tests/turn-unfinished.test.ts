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
import { TurnPlanCollector } from "../src/buyer/turn-plan-collector.js";
import {
  SessionTurnPlanner,
  TURN_UNFINISHED,
} from "../src/buyer/turn-planner.js";
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

class Unfinished {
  constructor(private readonly text: string) {}

  turn() {
    return Promise.resolve({ text: this.text, toolRequests: [], done: false });
  }

  close() {
    return Promise.resolve();
  }
}

function plannerOver(session: Unfinished): SessionTurnPlanner {
  return new SessionTurnPlanner(
    session,
    new TurnPlanCollector(),
    new RecordingLogger(),
  );
}

describe("an unfinished turn does not pass for an answer", () => {
  it("says it ran out of steps rather than standing the last draft up", async () => {
    const planner = plannerOver(new Unfinished("There's a navy kurta under…"));

    const plan = await planner.plan(["a navy kurta under 2000"]);

    expect(plan.action).toBe("answer");
    expect(plan.reply).toBe(TURN_UNFINISHED);
  });

  it("keeps a finished model's own sentence untouched", async () => {
    const finished = {
      turn: () =>
        Promise.resolve({ text: "What size?", toolRequests: [], done: true }),
      close: () => Promise.resolve(),
    };
    const planner = new SessionTurnPlanner(
      finished,
      new TurnPlanCollector(),
      new RecordingLogger(),
    );

    expect((await planner.plan(["hi"])).reply).toBe("What size?");
  });
});
