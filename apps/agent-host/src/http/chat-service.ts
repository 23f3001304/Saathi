import type { GatewayClient } from "@covenant/agents";
import type { Clock, Logger } from "@covenant/domain";

import type { ConfirmationGate } from "../purchase/confirmation-gate.js";
import type { PurchaseResult } from "../purchase/purchase-result.js";
import { emptyResult } from "../purchase/purchase-result.js";
import type { PurchaseRunner } from "../purchase/purchase-runner.js";
import type { BeatHub } from "./beat-hub.js";
import type {
  ChatServiceConfig,
  ChatState,
  ConversationRecorder,
  WebPickRunner,
} from "./chat-state.js";
import type { SortKeySignal } from "./sort-key-write.js";

export type {
  ChatServiceConfig,
  ChatState,
  ConversationRecorder,
  WebPickRunner,
} from "./chat-state.js";
import { cancelChat } from "./chat-cancel.js";
import { writeSortKey } from "./sort-key-write.js";

export type { SortKeySignal } from "./sort-key-write.js";

/** One conversation at a time: two runs signing intents concurrently would
 *  give the audit UI two timelines and no way to tell them apart. */
export class ChatService {
  private current: PurchaseResult | null = null;
  private running: Promise<PurchaseResult> | null = null;

  constructor(
    private readonly runner: PurchaseRunner,
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

  /** One run at a time; a second sentence queues rather than being refused. */
  private conversation: string | null = null;

  /** The picker as last stated. A tapped card carries no language of its own —
   *  the client sends a ref and nothing else — but the setting is a standing
   *  instruction, so the errand behind the tap answers in it. */
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

  /** The next run waits rather than being refused. */
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

  /** Waits for the predecessor however it settled, so a queued turn's beats
   *  file after its predecessor's rather than interleaved. */
  private async after(
    inFlight: Promise<PurchaseResult> | null,
    message: string,
    conversationId: string | null,
    replyLanguage: string | null,
  ): Promise<PurchaseResult> {
    if (inFlight !== null) {
      await inFlight.catch(() => undefined);
    }
    // A picker that never left the browser and one the runner dropped look
    // alike from a screenshot, so each leg says what it was handed.
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

  /** The shopper tapped an open-web card. It queues for the same reason a
   *  second sentence does — one window, one timeline. */
  pick(ref: string): PurchaseResult {
    // Read before `queue` overwrites it: a tapped card carries no sentence.
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
    if (inFlight !== null) {
      await inFlight.catch(() => undefined);
    }
    try {
      return await this.webPick.buy(ref, [stated], replyLanguage);
    } finally {
      this.recordSandbox();
    }
  }

  /** Filed while the window still exists: the next run retires it. */
  private recordSandbox(): void {
    const session = this.recorder.sandbox();
    if (session !== null) this.hub.emit({ kind: "sandbox", session });
  }

  /** Awaits the in-flight run; the CLI and the e2e need the value. */
  async settled(): Promise<PurchaseResult | null> {
    if (this.running !== null) {
      await this.running;
    }
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

  /** A deleted chat takes its working jobs with it. */
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
