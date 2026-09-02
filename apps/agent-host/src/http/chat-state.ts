import type { PurchaseResult } from "../purchase/purchase-result.js";
import type { ChatBeat, SandboxView } from "./chat-beat.js";

/** The runner as `ChatService` drives it: one method, no wiring. Structural
 *  for the same reason `WebPickRunner` is — the service holds a seam, and a
 *  test may stand a controllable run behind it. */
export interface RunnerPort {
  run(
    request: string,
    chat?: string,
    replyLanguage?: string | null,
  ): Promise<PurchaseResult>;
  /** The cart rebuilt for a tapped platform card; `null` when the ref is
   *  not this runner's to serve (no standing proposal, or a web ref). */
  repropose(ref: string): Promise<PurchaseResult | null>;
}

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
   * Which conversation this lane's beats belong to. A scoped request
   * (`?conversation=`) is answered by that conversation's own lane, so this
   * is confirmation; on the unscoped wire it is still the guard it always
   * was — the field a client checks before folding a run that may be another
   * chat's. `null` means the run was started without an id (the CLI, the
   * e2e), which no shelf conversation should claim as its own.
   */
  readonly conversation: string | null;
  /** Which run these indices belong to; the polling rung's rebase signal. */
  readonly epoch: number;
}

export interface ChatServiceConfig {
  readonly userId: string;
  readonly tenantId: string;
}
