// The purchase runner, wired with proxies that throw on any step a
// conversational turn must not take. Shared by every test that asserts what a
// turn shape does and — more to the point — what it does not.
import type { TurnPlan, TurnPlanner } from "@covenant/agents";

import { BeatHub } from "../../src/http/beat-hub.js";
import type { ConversationLine } from "../../src/purchase/dialogue.js";
import { LastProposal } from "../../src/purchase/last-proposal.js";
import { ConfirmationGate } from "../../src/purchase/confirmation-gate.js";
import { inertContext } from "../../src/purchase/context-record.js";
import type { RunnerParts } from "../../src/purchase/purchase-runner.js";
import { PurchaseRunner } from "../../src/purchase/purchase-runner.js";
import { ToolLog } from "../../src/purchase/tool-log.js";
import { RecordingLogger, SeqIds, StepClock } from "./fakes.js";

/**
 * Anything the answer path touches would be a step that happened. These throw
 * rather than record, so the test fails loudly on the first one.
 */
export function forbidden<T>(name: string): T {
  return new Proxy(
    {},
    {
      get(_target, key) {
        return () => {
          throw new Error(
            `${name}.${String(key)} ran on a conversational turn`,
          );
        };
      },
    },
  ) as T;
}

export function plannerSaying(plan: TurnPlan): TurnPlanner {
  return { plan: async () => plan };
}

export class RecordingConversation {
  readonly remembered: ConversationLine[] = [];
  readonly granted: (string | null)[] = [];

  async remember(text: string) {
    return this.write("user", text);
  }

  async rememberAgent(text: string) {
    return this.write("agent", text);
  }

  async recall(): Promise<readonly ConversationLine[]> {
    return this.remembered;
  }

  private write(speaker: ConversationLine["speaker"], text: string) {
    this.remembered.push({ speaker, text });
    // The gateway's answer, not the P1 the host claimed.
    const written = {
      memoryId: "mem_1",
      tierGranted: "P1",
      status: "committed",
    };
    this.granted.push(written.tierGranted);
    return written;
  }
}

/** Nothing parked and nothing on the table: these turns are about the fork,
 *  and either would take the turn before the fork is reached. */
function webParts() {
  return {
    webLook: forbidden("webLook"),
    webPick: {
      parked: false,
      resume: forbidden("webPick.resume"),
      buy: forbidden("webPick.buy"),
    },
    offered: { live: () => [], claim: () => undefined },
    // These turns are about the fork; the record layer has its own tests.
    context: inertContext(),
  };
}

export function runnerFor(plan: TurnPlan) {
  const hub = new BeatHub(new StepClock(), new RecordingLogger());
  const conversation = new RecordingConversation();
  const parts = {
    planner: plannerSaying(plan),
    conversation,
    // Durable traits are a second, separately-scoped memory; this turn has none.
    traits: { recall: async () => [], remember: async () => true },
    ...webParts(),
    sandbox: { retire: async () => false },
    merchantId: "kolam-run",
    intents: forbidden("intents"),
    buyer: forbidden("buyer"),
    fallback: forbidden("fallback"),
    log: new ToolLog(),
    gateway: forbidden("gateway"),
    carts: forbidden("carts"),
    settlement: forbidden("settlement"),
    hub,
    narrator: forbidden("narrator"),
    cartGate: new ConfirmationGate(true),
    lastProposal: new LastProposal(),
    shelf: { open: async () => [], current: () => [] },
    quotes: { newRun: () => undefined },
    logger: new RecordingLogger(),
    ids: new SeqIds(),
  } as unknown as RunnerParts;
  const runner = new PurchaseRunner(parts, {
    userId: "usr_1",
    tenantId: "tnt_demo",
    merchantIss: "mrc_1",
    agentInstanceId: "agi_1",
    retrieveLimit: 8,
  });
  return { runner, hub, conversation };
}
