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

  /** Wheel back = carry on: the parked checkout resumes by itself. */
  carryOn(): PurchaseResult | null {
    if (!this.webPick.parked || this.busy) return null;
    const language = this.language;
    return this.queue(
      emptyResult("urn:covenant:pick:carry-on", "carry on"),
      async (busy) => {
        if (busy !== null) await busy.catch(() => undefined);
        return this.webPick.resume([], language);
      },
    );
  }

  /** A tapped card queues like a sentence: one window, one timeline. */
  pick(ref: string): PurchaseResult {
    const stated = this.current?.request ?? "";
    const language = this.language;
    return this.queue(emptyResult(`urn:covenant:pick:${ref}`, ref), (busy) =>
      this.picked(busy, ref, stated, language),
    );
  }

  private async picked(
    inFlight: Promise<PurchaseResult> | null,
    ref: string,
    stated: string,
    replyLanguage: string | null,
  ): Promise<PurchaseResult> {
    if (inFlight !== null) await inFlight.catch(() => undefined);
    // Before the errand: the choice is the host's fact to replay, and a chat
    // that remounts mid-run must not re-offer a card already being fetched.
    this.hub.emit({ kind: "picked", ref });
    try {
      const reproposed = await this.runner.repropose(ref);
      if (reproposed !== null) return reproposed;
      return await this.webPick.buy(ref, [stated], replyLanguage);
    } finally {
      this.recordSandbox();
    }
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
