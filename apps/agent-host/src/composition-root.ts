import type { AgentSession } from "@covenant/agents";
import type { Clock, IdGenerator } from "@covenant/domain";

import { RandomIds, SystemClock } from "./adapters/system-ports.js";

import type { BrowserRegistry } from "./browser/browser-registry.js";
import type { BrowserService } from "./browser/browser-service.js";
import { SessionKeys } from "./http/session-keys.js";
import { WebFindings } from "./browser/web-listing.js";
import { WebProgress } from "./browser/web-progress.js";
import { WebPickPark } from "./purchase/web-pick-park.js";
import { WebOffered } from "./purchase/web-offered.js";
import { WebPin } from "./purchase/web-pin.js";
import { WebTrail } from "./browser/web-trail.js";
import type { AgentHostConfig } from "./config.js";
import type { BeatHub } from "./http/beat-hub.js";
import type { BeatLog } from "./http/beat-log.js";
import type { ConversationBeatStore } from "./http/beat-store.js";
import type { ChatService } from "./http/chat-service.js";
import type { AmendFlow } from "./covenant/amend-flow.js";
import { BeatDraftSink } from "./purchase/draft-beats.js";
import { type BuyerParts, wireBuyer } from "./wiring/buyer-wiring.js";
import {
  type DispatchParts,
  wireToolDispatch,
} from "./wiring/dispatch-wiring.js";
import { type GatewayParts, wireGateway } from "./wiring/gateway-wiring.js";
import { type KeyParts, wireKeys } from "./wiring/key-wiring.js";
import type { BuyerIdentityParts, MerchantParts } from "./wiring/merchant-wiring.js";
import { wireBuyerIdentity, wireMerchant } from "./wiring/merchant-wiring.js";
import { wireAmendFlow } from "./wiring/amend-wiring.js";
import { wireBrowserRegistry } from "./wiring/browser-wiring.js";
import { wireBeats, wireChat } from "./wiring/chat-wiring.js";
import { wireTraitMemory } from "./wiring/memory-wiring.js";
import type { ContextLog } from "./purchase/context-log.js";
import { wireWorkingContext } from "./wiring/context-wiring.js";
import { type ObsParts, wireObservability } from "./wiring/obs-wiring.js";
import type { SessionDeps } from "./wiring/session-wiring.js";
import {
  wireJudgeSession,
  wirePickSession,
  wireSession,
  wireTurnPlanner,
  wireWebSession,
} from "./wiring/session-wiring.js";

/** The assembled service map: everything the transport is allowed to touch. */
export interface CompositionRoot {
  readonly config: AgentHostConfig;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly obs: ObsParts;
  readonly keys: KeyParts;
  readonly identity: BuyerIdentityParts;
  readonly merchant: MerchantParts;
  readonly gateway: GatewayParts;
  readonly dispatch: DispatchParts;
  readonly session: AgentSession;
  readonly buyer: BuyerParts;
  readonly hub: BeatHub;
  readonly beats: ConversationBeatStore;
  readonly beatLog: BeatLog;
  /** The working-context table, closed at shutdown beside the beat log. */
  readonly contextLog: ContextLog;
  readonly chat: ChatService;
  /** The window the agent's own tools drive: the registry's primary. */
  readonly browser: BrowserService;
  /** Every other window on this host, each behind its own key. */
  readonly browserRegistry: BrowserRegistry;
  readonly browserKeys: SessionKeys;
  readonly amend: AmendFlow;
}

/**
 * The only file tree where collaborators are `new`ed (§12, enforced by
 * depcruise): `src/wiring/*` builds each layer and this function orders them.
 * The order is the dependency order and nothing else — observability first
 * because every later layer logs, keys before the merchant because a quote is
 * signed, the gateway (and with it the one `PreToolUseHook`) before the session
 * because both session paths install that same hook.
 */
function baseOf(config: AgentHostConfig) {
  const clock = new SystemClock();
  const ids = new RandomIds();
  const obs = wireObservability(config, clock, ids);
  const keys = wireKeys(config, clock, ids, obs.logger);
  return {
    config,
    clock,
    ids,
    obs,
    keys,
    identity: wireBuyerIdentity(keys, clock, ids),
    merchant: wireMerchant(config, keys, clock, ids, obs.logger),
    gateway: wireGateway(config, keys, obs, clock, ids),
  };
}

export function buildRoot(config: AgentHostConfig): CompositionRoot {
  const parts = baseOf(config);
  const sandbox = sandboxOf(config, parts);
  const browser = sandbox.browser;
  const window = windowParts(parts);
  // The durable shadow of the window layer's tables, opened right after them.
  const context = wireWorkingContext(parts, window);
  // Before the dispatcher and before the sessions: the sandbox tools write a
  // step into the hub after every move, the sessions stream drafts into it,
  // and its first epoch is read off the durable log `wireBeats` opens.
  const { hub, store, log } = wireBeats(config, parts.clock, parts.obs);
  const dispatch = wireToolDispatch({ ...parts, browser, ...window, hub });
  const sink = new BeatDraftSink(hub);
  const hook = parts.gateway.hook;
  const sessions = sessionsOf({ ...parts, hook, dispatch, sink });
  const buyer = wireBuyer({
    ...parts,
    ...sessions,
    ...window,
    browser,
    shopper: dispatch.shopper,
    dispatch,
    hub,
    drafts: sink,
    context: context.recorder,
  });
  return {
    ...parts,
    ...sandbox,
    dispatch,
    session: sessions.session,
    buyer,
    hub,
    beats: store,
    beatLog: log,
    contextLog: context.log,
    chat: wireChat(parts, buyer, { hub, store, log }, browser),
    amend: wireAmendFlow(parts),
  };
}

/** The window layer: the key ring, the registry over it, and the one window
 *  the agent's own tools drive. */
function sandboxOf(config: AgentHostConfig, parts: ReturnType<typeof baseOf>) {
  const browserKeys = new SessionKeys();
  const browserRegistry = wireBrowserRegistry(
    config,
    parts.clock,
    parts.ids,
    parts.obs,
    browserKeys,
  );
  return { browserKeys, browserRegistry, browser: browserRegistry.primary() };
}

/**
 * The three things the sandbox window and the run must agree about, built once
 * and shared: where it went, what it was shown, and what is durably known about
 * the shopper.
 *
 * One trail, because `WebShopper` writes where the window landed and the
 * open-web look reports from it — so the report is of the act and not of the
 * model's account of the act. One set of findings for the same reason, applied
 * to what the window was *shown*: a card cannot carry a price off a page this
 * host never opened. And one trait memory, because the facts that steer a
 * search are the same facts that fill a shop's delivery form.
 */
function windowParts(parts: {
  readonly clock: Clock;
  readonly obs: ObsParts;
  readonly keys: KeyParts;
  readonly gateway: GatewayParts;
}) {
  return {
    trail: new WebTrail(),
    findings: new WebFindings(),
    progress: new WebProgress(),
    park: new WebPickPark(),
    offered: new WebOffered(),
    pin: new WebPin(),
    traits: wireTraitMemory({
      gateway: parts.gateway.client,
      clock: parts.clock,
      logger: parts.obs.logger,
      userId: parts.keys.userIss,
    }),
  };
}

/** The three conversations and the planner over them, built together because
 *  they share every collaborator but their tool list. */
function sessionsOf(deps: SessionDeps) {
  return {
    session: wireSession(deps),
    judgeSession: wireJudgeSession(deps),
    webSession: wireWebSession(deps),
    pickSession: wirePickSession(deps),
    planner: wireTurnPlanner(deps).planner,
  };
}
