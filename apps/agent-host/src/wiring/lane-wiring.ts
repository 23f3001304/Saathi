import type { AgentSession } from "@covenant/agents";
import type { Clock, IdGenerator } from "@covenant/domain";

import type { BrowserRegistry } from "../browser/browser-registry.js";
import type { BrowserService } from "../browser/browser-service.js";
import { WebFindings } from "../browser/web-listing.js";
import { WebProgress } from "../browser/web-progress.js";
import type { AgentHostConfig } from "../config.js";
import type { BeatHub } from "../http/beat-hub.js";
import type { ConversationBeatStore } from "../http/beat-store.js";
import type { ChatService } from "../http/chat-service.js";
import type { ContextLog } from "../purchase/context-log.js";
import { ContextRecorder } from "../purchase/context-record.js";
import { BeatDraftSink } from "../purchase/draft-beats.js";
import type { TraitMemory } from "../purchase/trait-memory.js";
import { WebOffered } from "../purchase/web-offered.js";
import { WebPickPark } from "../purchase/web-pick-park.js";
import { WebPin } from "../purchase/web-pin.js";
import { WebTrail } from "../browser/web-trail.js";
import { type BuyerParts, wireBuyer } from "./buyer-wiring.js";
import type { BeatLogParts } from "./chat-wiring.js";
import { wireChat, wireLaneBeats } from "./chat-wiring.js";
import { type DispatchParts, wireToolDispatch } from "./dispatch-wiring.js";
import type { CredentialVault } from "../session/credential-vault.js";
import type { HeadlessReader } from "@covenant/browser-drive";
import type { GatewayParts } from "./gateway-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { BuyerIdentityParts, MerchantParts } from "./merchant-wiring.js";
import { wireMerchant } from "./merchant-wiring.js";
import type { ObsParts } from "./obs-wiring.js";
import {
  wireJudgeSession,
  wirePickSession,
  wireSession,
  wireTurnPlanner,
  wireWebSession,
} from "./session-wiring.js";

/** What every lane shares: the process singletons, and nothing a run mutates. */
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
  readonly beats: BeatLogParts;
}

/**
 * One conversation's whole working set. Everything a run mutates lives here —
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

/**
 * The per-lane clones of the window tables `windowParts` used to build once.
 * Same shapes, same sharing *within* the lane — one trail so the report is of
 * the act, one set of findings so a card cannot carry a price off a page this
 * lane never opened — but nothing here is reachable from another lane.
 */
function laneWindowParts(shared: LaneShared) {
  return {
    trail: new WebTrail(),
    findings: new WebFindings(),
    progress: new WebProgress(),
    park: new WebPickPark(),
    offered: new WebOffered(),
    pin: new WebPin(),
    traits: shared.traits,
  };
}

/**
 * DECISION: the default lane (`null`) keeps the registry's primary window and
 * a named conversation gets an agent window of its own. Why: the CLI and the
 * e2e drive the primary by long-standing contract, and a conversation that
 * shared it would hand its page trail to whichever lane ran next — the
 * inherited-window bug, third time around. The id is minted, not derived from
 * the conversation string: conversation ids are client-chosen and reach
 * container names, and a client must not get to pick those.
 */
function laneBrowser(shared: LaneShared, conversation: string | null) {
  return conversation === null
    ? shared.registry.primary()
    : shared.registry.agentWindow(`web_lane_${shared.ids.uuid()}`);
}

/** The four model conversations and the planner — lane-owned, every one.
 *  Two lanes sharing an `AgentSession` would interleave their transcripts. */
function laneSessions(
  shared: LaneShared,
  merchant: MerchantParts,
  dispatch: DispatchParts,
  sink: BeatDraftSink,
) {
  const deps = { ...shared, hook: shared.gateway.hook, merchant, dispatch, sink };
  return {
    session: wireSession(deps),
    judgeSession: wireJudgeSession(deps),
    webSession: wireWebSession(deps),
    pickSession: wirePickSession(deps),
    planner: wireTurnPlanner(deps).planner,
  };
}

/** The lane's tool side: its merchant view, dispatcher and model sessions.
 *  The merchant is per lane because `TurnShelf` holds one per-turn snapshot
 *  and `MerchantAgent` one per-run quota — either shared across lanes would
 *  be one run clearing the other's turn mid-purchase. */
function laneCore(
  shared: LaneShared,
  browser: BrowserService,
  window: ReturnType<typeof laneWindowParts>,
  hub: BeatHub,
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
  return {
    merchant,
    dispatch,
    sink,
    sessions: laneSessions(shared, merchant, dispatch, sink),
  };
}

export function wireLane(shared: LaneShared, conversation: string | null): Lane {
  const browser = laneBrowser(shared, conversation);
  const window = laneWindowParts(shared);
  const context = new ContextRecorder(shared.contextLog, window, shared.obs.logger);
  const beats = wireLaneBeats(shared.beats, shared.clock, shared.obs);
  const core = laneCore(shared, browser, window, beats.hub);
  const buyer = wireBuyer({
    ...shared,
    ...core.sessions,
    ...window,
    merchant: core.merchant,
    browser,
    dispatch: core.dispatch,
    shopper: core.dispatch.shopper,
    hub: beats.hub,
    drafts: core.sink,
    context,
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

/** Everything a retired lane holds a resource through, released quietly. */
async function closeLane(
  hub: BeatHub,
  browser: BrowserService,
  session: AgentSession,
): Promise<void> {
  hub.closeAll();
  await browser.close().catch(() => undefined);
  await session.close().catch(() => undefined);
}
