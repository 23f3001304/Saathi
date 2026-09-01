// Controllable lanes for the manager's own rules: the cap, the line, the
// drain, the retirement. The hubs are real, because "beats never cross" must
// be proven against the real fan-out; the engine behind them is a hand crank.
import type { GatewayClient } from "@covenant/agents";

import { BrowserService } from "../../src/browser/browser-service.js";
import { BeatHub } from "../../src/http/beat-hub.js";
import { forgetfulBeatLog } from "../../src/http/beat-log.js";
import { ConversationBeatStore } from "../../src/http/beat-store.js";
import type { ChatLane, LaneChat } from "../../src/http/chat-lanes.js";
import { ChatService } from "../../src/http/chat-service.js";
import type { ChatState, RunnerPort } from "../../src/http/chat-state.js";
import { ConfirmationGate } from "../../src/purchase/confirmation-gate.js";
import type { PurchaseResult } from "../../src/purchase/purchase-result.js";
import { emptyResult } from "../../src/purchase/purchase-result.js";
import { RecordingLogger, StepClock } from "./fakes.js";

export class FakeChat implements LaneChat {
  busy = false;
  readonly started: string[] = [];
  readonly picked: string[] = [];
  signed = 0;
  cancelled = 0;
  awaiting: readonly string[] = [];
  private waiters: (() => void)[] = [];

  constructor(readonly hub: BeatHub) {}

  start(message: string): PurchaseResult {
    this.started.push(message);
    this.busy = true;
    return emptyResult("urn:covenant:run:rig", message);
  }

  pick(ref: string): PurchaseResult {
    this.picked.push(ref);
    this.busy = true;
    return emptyResult(`urn:covenant:pick:${ref}`, ref);
  }

  /** Ends the run: the manager's settle callback fires and the line moves. */
  finish(): void {
    this.busy = false;
    const waiting = this.waiters;
    this.waiters = [];
    for (const wake of waiting) wake();
  }

  settled(): Promise<PurchaseResult | null> {
    if (!this.busy) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.waiters.push(() => resolve(null));
    });
  }

  state(): ChatState {
    return {
      result: null,
      beats: this.hub.snapshot(),
      awaiting: this.awaiting,
      running: this.busy,
      conversation: null,
      epoch: this.hub.epoch,
    };
  }

  cancel(): boolean {
    this.cancelled += 1;
    return true;
  }

  signIntent(): boolean {
    this.signed += 1;
    return true;
  }

  signCart(): boolean {
    return true;
  }

  recordSortKey(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

export interface RiggedLane extends ChatLane {
  readonly chat: FakeChat;
  readonly closed: () => boolean;
}

function laneShell(logger: RecordingLogger) {
  return {
    store: new ConversationBeatStore(forgetfulBeatLog(), logger),
    park: { parked: false },
    browser: new BrowserService({
      build: () => Promise.reject(new Error("no window in this rig")),
      ids: { uuid: () => "rig" },
      logger,
    }),
  };
}

export function riggedLane(
  conversation: string | null,
  epochs?: { next(): number },
): RiggedLane {
  const logger = new RecordingLogger();
  const hub = new BeatHub(new StepClock(), logger, epochs ? { epochs } : {});
  const chat = new FakeChat(hub);
  let closed = false;
  return {
    conversation,
    chat,
    hub,
    ...laneShell(logger),
    close: () => {
      closed = true;
      return Promise.resolve();
    },
    closed: () => closed,
  };
}

/** A real engine on a rigged lane: real `ChatService`, real gates, real hub.
 *  What the runner does with a turn is the test's to decide. */
export function realChatLane(
  conversation: string | null,
  runner: RunnerPort,
): ChatLane & { intentGate: ConfirmationGate; cartGate: ConfirmationGate } {
  const logger = new RecordingLogger();
  const hub = new BeatHub(new StepClock(), logger);
  const intentGate = new ConfirmationGate(false);
  const cartGate = new ConfirmationGate(false);
  const chat = new ChatService(
    runner,
    hub,
    intentGate,
    cartGate,
    null as unknown as GatewayClient,
    new StepClock(),
    logger,
    { userId: "usr_rig", tenantId: "tnt_rig" },
    { claim: () => undefined, open: () => undefined, sandbox: () => null },
    { buy: () => Promise.resolve(emptyResult("urn:covenant:run:pick", "")) },
  );
  return {
    conversation,
    chat,
    hub,
    intentGate,
    cartGate,
    ...laneShell(logger),
    close: () => Promise.resolve(),
  };
}
