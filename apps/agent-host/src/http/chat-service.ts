import type { GatewayClient } from "@covenant/agents";
import type { Clock, Logger } from "@covenant/domain";

import type { ConfirmationGate } from "../purchase/confirmation-gate.js";
import type { PurchaseResult } from "../purchase/purchase-result.js";
import { emptyResult } from "../purchase/purchase-result.js";
import type { BeatHub } from "./beat-hub.js";
import type {
  ChatServiceConfig,
  ChatState,
  ConversationRecorder,
  RunnerPort,
  WebPickRunner,
} from "./chat-state.js";
import type { SortKeySignal } from "./sort-key-write.js";

import { cancelChat } from "./chat-cancel.js";
import { carryOnPick, pickCard, type PickEngine } from "./chat-pick.js";
import { writeSortKey } from "./sort-key-write.js";

export type {
  ChatServiceConfig,
  ChatState,
  ConversationRecorder,
  WebPickRunner,
} from "./chat-state.js";
export type { SortKeySignal } from "./sort-key-write.js";

/** One conversation's engine: one runner, one hub, one pair of gates. A
 *  second sentence for THIS conversation queues behind its run; a different
 *  conversation runs on its own lane entirely (`ChatLanes`). */
export class ChatService {
  private current: PurchaseResult | null = null;
  private running: Promise<PurchaseResult> | null = null;

  constructor(
    private readonly runner: RunnerPort,
    private readonly hub: BeatHub,
    private readonly intentGate: ConfirmationGate,
    private readonly cartGate: ConfirmationGate,
    private readonly gateway: GatewayClient,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly config: ChatServiceConfig,
    private readonly recorder: ConversationRecorder,
    private readonly webPick: WebPickRunner,
  ) {}

  get busy(): boolean {
    return this.running !== null;
  }
  private conversation: string | null = null;

  /** The reply language as last stated; a tapped ref carries none. */
  private language: string | null = null;

  start(
    message: string,
    conversationId: string | null = null,
    replyLanguage: string | null = null,
  ): PurchaseResult {
    return this.queue(
      emptyResult("urn:covenant:run:pending", message),
      (busy) => this.after(busy, message, conversationId, replyLanguage),
    );
  }

  private queue(
    pending: PurchaseResult,
    work: (busy: Promise<PurchaseResult> | null) => Promise<PurchaseResult>,
  ): PurchaseResult {
    this.current = pending;
    const inFlight = this.running;
    this.running = work(inFlight)
      .then((result) => {
        this.current = result;
        return result;
      })
      .finally(() => {
        this.running = null;
      });
    return pending;
  }

  /** Waits for the predecessor, so queued turns' beats never interleave. */
  private async after(
    inFlight: Promise<PurchaseResult> | null,
    message: string,
    conversationId: string | null,
    replyLanguage: string | null,
  ): Promise<PurchaseResult> {
    if (inFlight !== null) await inFlight.catch(() => undefined);
    // Each leg says what it was handed: dropped and never-sent look alike.
    this.logger.debug("chat.reply_language", {
      at: "service",
      reply_language: replyLanguage,
    });
    this.conversation = conversationId;
    this.language = replyLanguage;
    this.recorder.claim(conversationId);
    this.recorder.open(conversationId, message);
    try {
      return await this.runner.run(
        message,
        conversationId ?? undefined,
        replyLanguage,
      );
    } finally {
      this.recordSandbox();
    }
  }

  carryOn(): PurchaseResult | null {
    return this.busy ? null : carryOnPick(this.engine());
  }

  pick(ref: string): PurchaseResult {
    return pickCard(this.engine(), ref);
  }

  /** Read at the moment of the tap, so a queued leg carries what was said and
   *  the language it was said in, not whatever the next turn changed them to. */
  private engine(): PickEngine {
    return {
      hub: this.hub,
      runner: this.runner,
      webPick: this.webPick,
      stated: this.current?.request ?? "",
      language: this.language,
      queue: (pending, work) => this.queue(pending, work),
      settled: () => this.recordSandbox(),
    };
  }

  private recordSandbox(): void {
    const session = this.recorder.sandbox();
    if (session !== null) this.hub.emit({ kind: "sandbox", session });
  }

  async settled(): Promise<PurchaseResult | null> {
    if (this.running !== null) await this.running;
    return this.current;
  }

  state(): ChatState {
    return {
      result: this.current,
      running: this.busy,
      conversation: this.conversation,
      epoch: this.hub.epoch,
      beats: this.hub.snapshot(),
      awaiting: [
        ...(this.intentGate.pending ? ["intent"] : []),
        ...(this.cartGate.pending ? ["cart"] : []),
      ],
    };
  }

  cancel(conversationId: string): boolean {
    if (this.conversation !== conversationId) return false;
    this.conversation = null;
    return cancelChat(this.intentGate, this.cartGate, this.hub);
  }

  signIntent(): boolean {
    return this.intentGate.sign();
  }

  signCart(): boolean {
    return this.cartGate.sign();
  }

  recordSortKey(signal: SortKeySignal): Promise<string | null> {
    return writeSortKey(
      this.gateway,
      this.clock,
      this.logger,
      this.config.userId,
      signal,
    );
  }
}
