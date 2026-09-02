import {
  purgeSandboxProfile,
  windowIdFor,
} from "../browser/sandbox-factory.js";
import type { BrowserService } from "../browser/browser-service.js";
import { laneWaitingSentence } from "../browser/session-capacity.js";
import type { PurchaseResult } from "../purchase/purchase-result.js";
import type { BeatHub } from "./beat-hub.js";
import type { ConversationBeatStore } from "./beat-store.js";
import type { ChatState } from "./chat-state.js";
import { pruneLanes } from "./lane-prune.js";
import type { SortKeySignal } from "./sort-key-write.js";

/** The engine surface a lane puts on the wire; `ChatService` satisfies
 *  it, a test stands a controllable fake in its place. */
export interface LaneChat {
  readonly busy: boolean;
  start(
    message: string,
    conversationId?: string | null,
    replyLanguage?: string | null,
  ): PurchaseResult;
  pick(ref: string): PurchaseResult;
  /** Continue a parked checkout after the wheel came back; `null` if none. */
  carryOn(): PurchaseResult | null;
  settled(): Promise<PurchaseResult | null>;
  state(): ChatState;
  cancel(conversationId: string): boolean;
  signIntent(): boolean;
  signCart(): boolean;
  recordSortKey(signal: SortKeySignal): Promise<string | null>;
}

/** What the manager needs of a lane; `wiring/lane-wiring.ts` satisfies it. */
export interface ChatLane {
  readonly conversation: string | null;
  readonly chat: LaneChat;
  readonly hub: BeatHub;
  readonly store: ConversationBeatStore;
  readonly park: { readonly parked: boolean };
  /** The lane's own sandbox window; the browser card watches it by lane. */
  readonly browser: BrowserService;
  readonly close: () => Promise<void>;
}

export type LaneFactory = (conversation: string | null) => ChatLane;

export type StartOutcome =
  | { readonly kind: "started"; readonly result: PurchaseResult }
  | { readonly kind: "queued"; readonly position: number; readonly human: string };

interface Waiting {
  readonly conversation: string | null;
  readonly run: (lane: ChatLane) => PurchaseResult;
}

/** `""` keys the id-less lane the CLI and the e2e drive. */
function keyOf(conversation: string | null): string {
  return conversation ?? "";
}

/** One lane per conversation, a bounded number running at once: the cap
 * bounds RUNS, not lanes, and the line is global so the oldest wait goes
 * first whichever chat it belongs to. */
export class ChatLanes {
  private readonly lanes = new Map<string, ChatLane>();
  private readonly waiting: Waiting[] = [];
  private recent: ChatLane;

  constructor(
    private readonly build: LaneFactory,
    readonly cap: number,
  ) {
    this.recent = this.laneFor(null);
  }

  laneFor(conversation: string | null): ChatLane {
    const key = keyOf(conversation);
    const held = this.lanes.get(key);
    if (held !== undefined) return held;
    const lane = this.build(conversation);
    this.lanes.set(key, lane);
    pruneLanes(this.lanes);
    return lane;
  }

  latest(): ChatLane {
    return this.recent;
  }
  all(): readonly ChatLane[] {
    return [...this.lanes.values()];
  }
  /** Conversations waiting in line, in order. */
  queued(): readonly (string | null)[] {
    return this.waiting.map((entry) => entry.conversation);
  }
  get running(): number {
    return this.all().filter((lane) => lane.chat.busy).length;
  }

  start(
    message: string,
    conversation: string | null,
    replyLanguage: string | null,
  ): StartOutcome {
    return this.admit(conversation, (lane) =>
      lane.chat.start(message, conversation, replyLanguage),
    );
  }
  pick(ref: string, conversation: string | null): StartOutcome {
    return this.admit(conversation, (lane) => lane.chat.pick(ref));
  }

  private admit(
    conversation: string | null,
    run: (lane: ChatLane) => PurchaseResult,
  ): StartOutcome {
    const lane = this.laneFor(conversation);
    // A chat already in line keeps its order.
    const inLine = this.waiting.some(
      (entry) => entry.conversation === conversation,
    );
    if (!inLine && (lane.chat.busy || this.running < this.cap)) {
      return { kind: "started", result: this.begun(lane, run) };
    }
    this.waiting.push({ conversation, run });
    const position = this.waiting.length;
    return {
      kind: "queued",
      position,
      human: laneWaitingSentence(position, this.cap),
    };
  }

  private begun(
    lane: ChatLane,
    run: (lane: ChatLane) => PurchaseResult,
  ): PurchaseResult {
    this.recent = lane;
    const result = run(lane);
    // A settled run frees a slot; the line moves then and only then.
    const moveLine = (): void => {
      this.drain();
    };
    void lane.chat.settled().catch(() => undefined).finally(moveLine);
    return result;
  }

  /** The head of the line starts on a free slot, or at once in-lane. */
  private drain(): void {
    for (;;) {
      const next = this.waiting[0];
      if (next === undefined) return;
      const lane = this.laneFor(next.conversation);
      if (!lane.chat.busy && this.running >= this.cap) return;
      this.waiting.shift();
      this.begun(lane, next.run);
    }
  }

  /** A deleted chat takes its lane, its window and its place in line with it. */
  async cancel(conversation: string): Promise<boolean> {
    const queuedAt = this.waiting.findIndex(
      (entry) => entry.conversation === conversation,
    );
    if (queuedAt !== -1) this.waiting.splice(queuedAt, 1);
    const lane = this.lanes.get(keyOf(conversation));
    if (lane === undefined) return queuedAt !== -1;
    lane.chat.cancel(conversation);
    this.lanes.delete(keyOf(conversation));
    if (this.recent === lane) this.recent = this.laneFor(null);
    await lane.close();
    // Deleting the chat deletes the window's stored profile with it.
    purgeSandboxProfile(windowIdFor(conversation));
    return true;
  }

  /** The wheel handed back resumes the lane's parked checkout by itself. */
  carryOn(conversation: string | null): void {
    this.lanes.get(keyOf(conversation))?.chat.carryOn();
  }

  /** Forget: closes the lane's window; the caller purges the profile. */
  closeWindow(conversation: string): Promise<void> | undefined {
    return this.lanes.get(keyOf(conversation))?.browser.close();
  }
  /** Shutdown: every lane's run settled, then every lane's resources gone. */
  async settleAll(): Promise<void> {
    this.waiting.length = 0;
    await Promise.all(
      this.all().map((lane) => lane.chat.settled().catch(() => undefined)),
    );
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.all().map((lane) => lane.close()));
    this.lanes.clear();
  }
}
