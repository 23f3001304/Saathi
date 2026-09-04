import type { AgentSession, PlannerReads } from "@covenant/agents";
import type { HeadlessReader } from "@covenant/browser-drive";
import type { Clock, IdGenerator } from "@covenant/domain";

import type { BrowserRegistry } from "../browser/browser-registry.js";
import type { BrowserService } from "../browser/browser-service.js";
import type { AgentHostConfig } from "../config.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { ConversationBeatStore } from "../http/beat-store.js";
import type { ChatService } from "../http/chat-service.js";
import { ConfirmationGate } from "../purchase/confirmation-gate.js";
import type { PageIndex } from "../purchase/page-index.js";
import type { ContextLog } from "../purchase/context-log.js";
import { ContextRecorder } from "../purchase/context-record.js";
import { BeatDraftSink } from "../purchase/draft-beats.js";
import type { TraitMemory } from "../purchase/trait-memory.js";
import { TurnLanguage } from "../purchase/turn-language.js";
import type { WebPickPark } from "../purchase/web-pick-park.js";
import type { CredentialVault } from "../session/credential-vault.js";
import { type BuyerParts, wireBuyer } from "./buyer-wiring.js";
import type { BeatLogParts } from "./chat-wiring.js";
import { wireChat, wireLaneBeats } from "./chat-wiring.js";
import { type DispatchParts, wireToolDispatch } from "./dispatch-wiring.js";
import type { GatewayParts } from "./gateway-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { LaneWindowParts } from "./lane-parts.js";
import { closeLane, laneBrowser, laneWindowParts } from "./lane-parts.js";
import type { BuyerIdentityParts, MerchantParts } from "./merchant-wiring.js";
import { wireMerchant } from "./merchant-wiring.js";
import type { ObsParts } from "./obs-wiring.js";
import { type LaneGates, plannerReadsOf } from "./reads-wiring.js";
import {
  wirePickSession,
  wireSession,
  wireTurnPlanner,
  wireWebSession,
} from "./session-wiring.js";

/** The process singletons; nothing a run mutates. */
export interface LaneShared {
  readonly config: AgentHostConfig;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly obs: ObsParts;
  readonly keys: KeyParts;
  readonly identity: BuyerIdentityParts;
  readonly gateway: GatewayParts;
  readonly registry: BrowserRegistry;
  /** Durable and shopper-scoped, not conversation-scoped: shareable. */
  readonly traits: TraitMemory;
  /** The stored sign-ins; read only by the host's sign-in routine. */
  readonly vault: CredentialVault;
  /** The host's one headless read-only browser, shared across lanes. */
  readonly reader: HeadlessReader;
  readonly contextLog: ContextLog;
  /** Host-wide, deliberately: one shopper's find is the next one's head
   *  start, and nothing filed there belongs to a conversation. */
  readonly pages: PageIndex;
  readonly beats: BeatLogParts;
}

/**
 * One conversation's whole working set. Everything a run mutates lives here,
 * which is the entire point: a second lane can be mid-errand and there is no
 * object these two runs both write.
 */
export interface Lane {
  readonly conversation: string | null;
  readonly chat: ChatService;
  readonly hub: BeatHub;
  readonly store: ConversationBeatStore;
  readonly buyer: BuyerParts;
  readonly dispatch: DispatchParts;
  readonly session: AgentSession;
  readonly browser: BrowserService;
  readonly park: WebPickPark;
  readonly close: () => Promise<void>;
}

/** What the planner's reads and the runner's gates share. Built before
 *  either, because the reads report `pending_signature` off the very gates
 *  the runner waits on. */
interface LaneState {
  readonly gates: LaneGates;
  readonly language: TurnLanguage;
  readonly context: ContextRecorder;
  /** Shared, not per lane: see `LaneShared.pages`. */
  readonly pages: PageIndex;
}

function laneState(shared: LaneShared, window: LaneWindowParts): LaneState {
  return {
    gates: {
      intent: new ConfirmationGate(shared.config.autoSign),
      cart: new ConfirmationGate(shared.config.autoSign),
    },
    language: new TurnLanguage(),
    context: new ContextRecorder(shared.contextLog, window, shared.obs.logger),
    pages: shared.pages,
  };
}

/** The three model conversations and the planner, lane-owned, every one.
 *  Two lanes sharing an `AgentSession` would interleave their transcripts. */
function laneSessions(
  shared: LaneShared,
  merchant: MerchantParts,
  dispatch: DispatchParts,
  sink: BeatDraftSink,
  reads: PlannerReads,
) {
  const deps = { ...shared, hook: shared.gateway.hook, merchant, dispatch, sink };
  return {
    session: wireSession(deps),
    webSession: wireWebSession(deps),
    pickSession: wirePickSession(deps),
    planner: wireTurnPlanner(deps, reads).planner,
  };
}

/** The lane's tool side: its merchant view, dispatcher and model sessions.
 *  The merchant is per lane because `TurnShelf` holds one per-turn snapshot
 *  and `MerchantAgent` one per-run quota; either shared across lanes would
 *  be one run clearing the other's turn mid-purchase. */
function laneCore(
  shared: LaneShared,
  browser: BrowserService,
  window: LaneWindowParts,
  hub: BeatHub,
  state: LaneState,
) {
  const merchant = wireMerchant(
    shared.config,
    shared.keys,
    shared.clock,
    shared.ids,
    shared.obs.logger,
  );
  const dispatch = wireToolDispatch({ ...shared, merchant, browser, ...window, hub });
  const sink = new BeatDraftSink(hub);
  const reads = plannerReadsOf({
    config: shared.config,
    merchant,
    browser,
    offered: window.offered,
    park: window.park,
    progress: window.progress,
    findings: window.findings,
    gates: state.gates,
    vault: shared.vault,
    context: state.context,
    language: state.language,
  });
  return {
    merchant,
    dispatch,
    sink,
    sessions: laneSessions(shared, merchant, dispatch, sink, reads),
  };
}

export function wireLane(shared: LaneShared, conversation: string | null): Lane {
  const browser = laneBrowser(shared.registry, conversation);
  const window = laneWindowParts(shared.traits);
  const state = laneState(shared, window);
  const beats = wireLaneBeats(shared.beats, shared.clock, shared.obs);
  const core = laneCore(shared, browser, window, beats.hub, state);
  const buyer = wireBuyer({
    ...shared,
    ...core.sessions,
    ...window,
    ...state,
    merchant: core.merchant,
    browser,
    dispatch: core.dispatch,
    shopper: core.dispatch.shopper,
    hub: beats.hub,
    drafts: core.sink,
  });
  return {
    conversation,
    chat: wireChat(shared, buyer, beats, browser),
    hub: beats.hub,
    store: beats.store,
    buyer,
    dispatch: core.dispatch,
    session: core.sessions.session,
    browser,
    park: window.park,
    close: () => closeLane(beats.hub, browser, core.sessions.session),
  };
}
