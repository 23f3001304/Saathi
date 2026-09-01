import type { PurchaseResult } from "../purchase/purchase-result.js";
import type { ChatBeat, SandboxView } from "./chat-beat.js";

/**
 * Driving a shop the shopper picked off an open-web card. Structural, so
 * `ChatService` never learns that a browser exists — the same shape
 * `RunnerParts` keeps for `SandboxOwner`.
 */
export interface WebPickRunner {
  buy(
    ref: string,
    stated: readonly string[],
    replyLanguage: string | null,
  ): Promise<PurchaseResult>;
}

/** What the durable conversation log needs from a run, and nothing else. */
export interface ConversationRecorder {
  /** Stamp the sandbox owner for the run about to start. */
  claim(conversationId: string | null): void;
  /** The turn about to run, and the sentence that started it. */
  readonly open: (conversationId: string | null, said: string) => void;
  /** The sandbox window as it stands, or null when none is open. */
  readonly sandbox: () => SandboxView | null;
}

export interface ChatState {
  readonly result: PurchaseResult | null;
  readonly beats: readonly ChatBeat[];
  readonly awaiting: readonly string[];
  /** True while a run is still in flight. A client that attaches afterwards
   *  is looking at somebody else's finished conversation, not its own. */
  readonly running: boolean;
  /**
   * Which conversation the hub's beats belong to. The hub is one fan-out for
   * the whole host, so a client showing chat B while a run from chat A is
   * streaming would otherwise fold A's beats into B's transcript — the
   * cross-chat bleed this field exists to let a client refuse. `null` means
   * the run was started without an id (the CLI, the e2e), which no shelf
   * conversation should claim as its own.
   */
  readonly conversation: string | null;
  /** Which run these indices belong to; the polling rung's rebase signal. */
  readonly epoch: number;
}

export interface ChatServiceConfig {
  readonly userId: string;
  readonly tenantId: string;
}
