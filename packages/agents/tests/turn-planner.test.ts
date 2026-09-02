import { describe, expect, it } from "vitest";

import {
  ANSWER_TOOL,
  BROWSE_TOOL,
  BUYER_TOOL_SERVER,
  DECLINE_TOOL,
  PROPOSE_TOOL,
  WEB_LOOK_TOOL,
} from "../src/buyer/turn-plan.js";
import {
  ScriptedTurnPlanner,
  SessionTurnPlanner,
  TurnPlanCollector,
} from "../src/buyer/turn-planner.js";
import { callTool, ScriptedSession, say } from "./doubles.js";
import { RecordingLogger } from "./fakes.js";

/** The draft arguments `propose_purchase` now takes, for the cases here that
 *  are about which move was recorded rather than about the draft itself. */
const DRAFT = {
  sku: "ST-KURTA-NAVY-M",
  max_amount_paise: 200_000,
  requires_refundability: false,
  description: "a navy kurta",
};

function collectorAfter(tool: string, args: Record<string, unknown>) {
  const collector = new TurnPlanCollector();
  return {
    collector,
    done: collector.dispatch({ tool, server: BUYER_TOOL_SERVER, args }),
  };
}

describe("recording the choice", () => {
  it("reads the reply and the question off an answer", async () => {
    const { collector, done } = collectorAfter(ANSWER_TOOL, {
      reply: "Hello.",
      question: "What is your budget?",
    });
    await done;
    expect(collector.take()).toEqual({
      action: "answer",
      reply: "Hello.",
      question: "What is your budget?",
      replies: [],
      choiceGroups: [],
      query: null,
      amendment: null,
      traits: [],
    });
  });

  it("maps propose to draft_intent and decline to decline", async () => {
    const first = collectorAfter(PROPOSE_TOOL, { ...DRAFT, reply: "On it." });
    await first.done;
    expect(first.collector.take()?.action).toBe("draft_intent");
    const second = collectorAfter(DECLINE_TOOL, { reply: "No purchase here." });
    await second.done;
    expect(second.collector.take()?.action).toBe("decline");
  });
});

describe("the open-web move", () => {
  it("maps the open-web move to look_on_web, terminal like a browse", async () => {
    const { collector, done } = collectorAfter(WEB_LOOK_TOOL, {
      reply: "Opening Amazon now.",
      query: "1TB SSD under 50000",
    });
    await done;
    const plan = collector.take();
    expect(plan?.action).toBe("look_on_web");
    expect(plan?.query).toBe("1TB SSD under 50000");
  });

  /**
   * A browse is recorded, and the model may still change its move in the same
   * turn: the shop's own stock reaches it through `see_shelf` (Stage 2), never
   * as a count the harness computed with a word list.
   */
  it("records the browse and still lets the model change its mind", async () => {
    const collector = new TurnPlanCollector();
    const outcome = await collector.dispatch({
      tool: BROWSE_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { reply: "Let me look.", skus: ["ST-KURTA-NAVY-M"] },
    });
    expect(JSON.parse(outcome.content)).toMatchObject({ recorded: "browse" });
    await collector.dispatch({
      tool: WEB_LOOK_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { reply: "Nothing here, going to Amazon.", query: "1TB SSD" },
    });
    expect(collector.take()?.action).toBe("look_on_web");
  });
});

describe("one plan per turn", () => {
  it("clears itself, so one turn's plan cannot leak into the next", async () => {
    const { collector, done } = collectorAfter(ANSWER_TOOL, { reply: "Hi." });
    await done;
    expect(collector.take()).not.toBeNull();
    expect(collector.take()).toBeNull();
  });

  it("refuses a tool that is not one of the moves", async () => {
    const collector = new TurnPlanCollector();
    const outcome = await collector.dispatch({
      tool: "execute_payment",
      server: BUYER_TOOL_SERVER,
      args: {},
    });
    expect(outcome.isError).toBe(true);
    expect(collector.take()).toBeNull();
  });
});

describe("the live planner", () => {
  it("returns the move the model chose", async () => {
    const collector = new TurnPlanCollector();
    await collector.dispatch({
      tool: PROPOSE_TOOL,
      server: BUYER_TOOL_SERVER,
      args: { ...DRAFT, reply: "Looking now." },
    });
    const planner = new SessionTurnPlanner(
      new ScriptedSession([say("")]),
      collector,
      new RecordingLogger(),
    );
    expect((await planner.plan(["buy a lamp"])).action).toBe("draft_intent");
  });

  it("treats prose with no tool call as an answer, never as a purchase", async () => {
    const planner = new SessionTurnPlanner(
      new ScriptedSession([say("Hello. What are you shopping for?")]),
      new TurnPlanCollector(),
      new RecordingLogger(),
    );
    const plan = await planner.plan(["hi"]);
    expect(plan.action).toBe("answer");
    expect(plan.reply).toBe("Hello. What are you shopping for?");
  });
});

describe("failing closed", () => {
  it("answers rather than buys when the session itself fails", async () => {
    const broken = {
      turn: () => Promise.reject(new Error("provider unreachable")),
      close: () => Promise.resolve(),
    };
    const planner = new SessionTurnPlanner(
      broken,
      new TurnPlanCollector(),
      new RecordingLogger(),
    );
    expect((await planner.plan(["hi"])).action).toBe("answer");
  });

  it("ignores the tool call's own arguments as prose", async () => {
    const session = new ScriptedSession([
      callTool("c1", ANSWER_TOOL, BUYER_TOOL_SERVER, { reply: "Hi." }),
    ]);
    const planner = new SessionTurnPlanner(
      session,
      new TurnPlanCollector(),
      new RecordingLogger(),
    );
    expect((await planner.plan(["hi"])).reply).toBe("");
  });
});

describe("the scripted planner", () => {
  it("drafts, because the script is a purchase", async () => {
    expect((await new ScriptedTurnPlanner().plan(["buy"])).action).toBe(
      "draft_intent",
    );
  });
});
