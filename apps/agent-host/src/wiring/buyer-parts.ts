import type { AgentSession, TurnPlanner } from "@covenant/agents";
import type { Clock, IdGenerator } from "@covenant/domain";

import type { BrowserService } from "../browser/browser-service.js";
import type { ContextRecorder } from "../purchase/context-record.js";
import type { WebFindings } from "../browser/web-listing.js";
import type { WebProgress } from "../browser/web-progress.js";
import type { WebShopper } from "../browser/web-shopper.js";
import type { WebTrail } from "../browser/web-trail.js";
import type { AgentHostConfig } from "../config.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { ConfirmationGate } from "../purchase/confirmation-gate.js";
import type { ConversationMemory } from "../purchase/conversation-memory.js";
import type { PurchaseRunner } from "../purchase/purchase-runner.js";
import type { ToolLog } from "../purchase/tool-log.js";
import type { TraitMemory } from "../purchase/trait-memory.js";
import type { TurnLanguage } from "../purchase/turn-language.js";
import type { WebBuyStep } from "../purchase/web-buy-step.js";
import type { WebOffered } from "../purchase/web-offered.js";
import type { WebPin } from "../purchase/web-pin.js";
import type { WebPickPark } from "../purchase/web-pick-park.js";
import type { DispatchParts } from "./dispatch-wiring.js";
import type { GatewayParts } from "./gateway-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { BuyerIdentityParts, MerchantParts } from "./merchant-wiring.js";
import type { ObsParts } from "./obs-wiring.js";
import type { LaneGates } from "./reads-wiring.js";

export interface BuyerParts {
  readonly runner: PurchaseRunner;
  /** The dialogue in PTLM, shared with `GET /chat/history` so a rehydrating
   *  client and the run read the same rows by the same path. */
  readonly conversation: ConversationMemory;
  readonly log: ToolLog;
  readonly intentGate: ConfirmationGate;
  readonly cartGate: ConfirmationGate;
  readonly session: AgentSession;
  /** What a tapped open-web card drives, handed to `ChatService`. */
  readonly webPick: WebBuyStep;
}

export interface BuyerDeps {
  readonly config: AgentHostConfig;
  /** Told the signed ceiling, so the sandbox cart check has one to hold. */
  readonly browser: BrowserService;
  readonly keys: KeyParts;
  readonly obs: ObsParts;
  readonly gateway: GatewayParts;
  readonly merchant: MerchantParts;
  readonly identity: BuyerIdentityParts;
  readonly dispatch: DispatchParts;
  readonly session: AgentSession;
  /** The open-web errand's own conversation; the sandbox tools and no others. */
  readonly webSession: AgentSession;
  /** The tapped-card errand's own conversation. Two contracts, two threads —
   *  the same reason the research errand does not share the buyer's. */
  readonly pickSession: AgentSession;
  /** Where the sandbox window actually went, shared with `WebShopper`. */
  readonly trail: WebTrail;
  /** Every product tile the window was shown, shared with `WebShopper`. */
  readonly findings: WebFindings;
  /** What the host watched itself do at the window this errand. */
  readonly progress: WebProgress;
  /** Whether a pick is standing at an address the shopper has not agreed to. */
  readonly park: WebPickPark;
  /** The cards on the table, so a typed "go with the Crucial" is the same act
   *  as tapping one. */
  readonly offered: WebOffered;
  /** The one product a buy errand may open; released by every look. */
  readonly pin: WebPin;
  /** The conversation's durable working context — claimed, read and written
   *  by the run; read-only from the errand that starts at a known page. */
  readonly context: ContextRecorder;
  /** The lane's hold-to-sign gates, built with the lane so the planner's
   *  reads report what is pending on the same pair the runner waits on. */
  readonly gates: LaneGates;
  /** The reply language the app sent with the turn, for the reads. */
  readonly language: TurnLanguage;
  /** Where a streamed answer went; absent on a host that does not stream. */
  readonly drafts?: { withdrawLast(reason: string): void } | null;
  /** The sandbox tools' own shopper, so a pick opens the page the tools read. */
  readonly shopper: WebShopper;
  /** What is durably known about the shopper; also fills a delivery form. */
  readonly traits: TraitMemory;
  readonly planner: TurnPlanner;
  readonly hub: BeatHub;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}
