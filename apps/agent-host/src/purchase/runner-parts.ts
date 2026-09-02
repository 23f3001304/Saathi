import type {
  BuyerAgent,
  GatewayClient,
  Shelf,
  TurnPlanner,
} from "@covenant/agents";
import type { IdGenerator, Logger } from "@covenant/domain";

import type { BeatHub } from "../http/beat-hub.js";
import type { CartBuilder } from "./cart-builder.js";
import type { CheckoutStep } from "./checkout-step.js";
import type { ConfirmationGate } from "./confirmation-gate.js";
import type { ContextRecall } from "./context-record.js";
import type { ConversationMemory } from "./conversation-memory.js";
import type { IntentFlow } from "./intent-flow.js";
import type { RunNarrator } from "./run-narrator.js";
import type { LastProposal } from "./last-proposal.js";
import type { PendingDraft } from "./pending-draft.js";
import type { MerchantToolFallback } from "./tool-fallback.js";
import type { ToolLog } from "./tool-log.js";
import type { TraitMemory } from "./trait-memory.js";
import type { TurnLanguage } from "./turn-language.js";
import type { WebLook } from "./web-look-step.js";
import type { WebPickResume } from "./turn-step.js";
import type { WebOffered } from "./web-offered.js";

/**
 * The sandbox window's lifetime, as the run sees it. Structural on purpose:
 * this file must not learn that a browser exists, the same way `IntentFlow`
 * knows only `CeilingSink`.
 */
export interface SandboxOwner {
  /** Ends a window the agent still owns. `false` when there was none, or when
   *  the shopper has the wheel and it is not ours to take away. */
  retire(): Promise<boolean>;
}

/**
 * The merchant's per-run negotiation state. Structural on purpose, like
 * `SandboxOwner` above: this file must not learn that a merchant agent exists.
 */
export interface QuoteRounds {
  newRun(): void;
}

export interface RunnerConfig {
  readonly userId: string;
  readonly tenantId: string;
  readonly merchantIss: string;
  readonly agentInstanceId: string;
  readonly retrieveLimit: number;
}

/**
 * Everything one run may touch, named in one place so the steps split out of
 * `PurchaseRunner` can take it without importing the runner back.
 */
export interface RunnerParts {
  readonly planner: TurnPlanner;
  readonly conversation: ConversationMemory;
  readonly traits: TraitMemory;
  readonly intents: IntentFlow;
  readonly buyer: BuyerAgent;
  readonly webLook: WebLook;
  /** A checkout parked mid-flight, so the next sentence resumes it. */
  readonly webPick: WebPickResume;
  /** The cards on the table, so a sentence naming one is the pick it is. */
  readonly offered: WebOffered;
  /** The conversation's working context: claimed at the top of a run,
   *  written back by the shell when the run ends. */
  readonly context: ContextRecall;
  /** Where a streamed answer went, so one the run then contradicts can be
   *  taken back off the screen. `null` on a host with no streaming. */
  readonly drafts: { withdrawLast(reason: string): void } | null;
  /** The reply language the app sent with this turn; set before anything
   *  reads, so `see_state` reports it. */
  readonly language: TurnLanguage;
  readonly sandbox: SandboxOwner;
  readonly fallback: MerchantToolFallback;
  /** The standing cart's makings, so a tapped card can rebuild it. */
  readonly lastProposal: LastProposal;
  /** The planner's proposal, held for the judge that drafts the sheet. */
  readonly pending: PendingDraft;
  readonly log: ToolLog;
  readonly gateway: GatewayClient;
  readonly carts: CartBuilder;
  readonly settlement: CheckoutStep;
  readonly hub: BeatHub;
  readonly narrator: RunNarrator;
  readonly cartGate: ConfirmationGate;
  /** Opened once at the top of the run; every read in the turn is off it. */
  readonly shelf: Shelf;
  readonly quotes: QuoteRounds;
  readonly merchantId: string;
  readonly logger: Logger;
  readonly ids: IdGenerator;
}
