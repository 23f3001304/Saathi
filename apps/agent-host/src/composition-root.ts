import type { AgentSession } from "@covenant/agents";
import type { Clock, IdGenerator } from "@covenant/domain";

import { RandomIds, SystemClock } from "./adapters/system-ports.js";

import type { BrowserRegistry } from "./browser/browser-registry.js";
import type { BrowserService } from "./browser/browser-service.js";
import { laneCapFor } from "./browser/session-capacity.js";
import { SessionKeys } from "./http/session-keys.js";
import type { AgentHostConfig } from "./config.js";
import type { BeatHub } from "./http/beat-hub.js";
import type { BeatLog } from "./http/beat-log.js";
import type { ConversationBeatStore } from "./http/beat-store.js";
import { ChatLanes } from "./http/chat-lanes.js";
import type { ChatService } from "./http/chat-service.js";
import type { AmendFlow } from "./covenant/amend-flow.js";
import { CredentialVault } from "./session/credential-vault.js";
import { HeadlessReader, NavigationPolicy } from "@covenant/browser-drive";
import type { BuyerParts } from "./wiring/buyer-wiring.js";
import type { DispatchParts } from "./wiring/dispatch-wiring.js";
import { type GatewayParts, wireGateway } from "./wiring/gateway-wiring.js";
import { type KeyParts, wireKeys } from "./wiring/key-wiring.js";
import type { BuyerIdentityParts } from "./wiring/merchant-wiring.js";
import { wireBuyerIdentity } from "./wiring/merchant-wiring.js";
import { wireAmendFlow } from "./wiring/amend-wiring.js";
import { wireBrowserRegistry } from "./wiring/browser-wiring.js";
import { wireBeatLog } from "./wiring/chat-wiring.js";
import { type Lane, type LaneShared, wireLane } from "./wiring/lane-wiring.js";
import { wireTraitMemory } from "./wiring/memory-wiring.js";
import type { ContextLog } from "./purchase/context-log.js";
import { openContextLog } from "./purchase/context-log.js";
import { type ObsParts, wireObservability } from "./wiring/obs-wiring.js";

/** The assembled service map: everything the transport is allowed to touch.
 *  `chat`, `hub`, `buyer`, `session`, `beats` and `dispatch` are the default
 *  lane's — the id-less one the CLI and the e2e drive — so every caller that
 *  predates lanes keeps exactly the object it always had. */
export interface CompositionRoot {
  readonly config: AgentHostConfig;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly obs: ObsParts;
  readonly keys: KeyParts;
  readonly identity: BuyerIdentityParts;
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
  /** Every conversation's lane, and the line behind the lane cap. */
  readonly lanes: ChatLanes;
  /** The default lane's window: the registry's primary. */
  readonly browser: BrowserService;
  /** Every other window on this host, each behind its own key. */
  readonly browserRegistry: BrowserRegistry;
  readonly browserKeys: SessionKeys;
  readonly amend: AmendFlow;
  /** The shopper's stored sign-ins; read only by the sign-in routine. */
  readonly vault: CredentialVault;
}

/**
 * The only file tree where collaborators are `new`ed (§12, enforced by
 * depcruise): `src/wiring/*` builds each layer and this function orders them.
 * The order is the dependency order and nothing else — observability first
 * because every later layer logs, keys before the gateway because requests are
 * signed. The merchant is *not* here any more: `TurnShelf` and the quote quota
 * are per-run state, so each lane wires its own (`lane-wiring.ts`).
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
    gateway: wireGateway(config, keys, obs, clock, ids),
  };
}

/** The window layer: the key ring, and the registry over it. */
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
 * What every lane shares: the durable logs, the epoch counter, the shopper's
 * trait memory, and the process singletons. Everything a run *mutates* is
 * deliberately absent — those are built per lane, which is the whole defence
 * against one conversation's run writing into another's.
 */
function sharedOf(
  parts: ReturnType<typeof baseOf>,
  sandbox: ReturnType<typeof sandboxOf>,
): Omit<LaneShared, "vault" | "reader"> {
  return {
    ...parts,
    registry: sandbox.browserRegistry,
    traits: wireTraitMemory({
      gateway: parts.gateway.client,
      clock: parts.clock,
      logger: parts.obs.logger,
      userId: parts.keys.userIss,
    }),
    contextLog: openContextLog(
      parts.config.dbFile,
      parts.clock,
      parts.obs.logger,
    ),
    beats: wireBeatLog(parts.config, parts.clock, parts.obs),
  };
}

export function buildRoot(config: AgentHostConfig): CompositionRoot {
  const parts = baseOf(config);
  const sandbox = sandboxOf(config, parts);
  const vault = new CredentialVault(config.vaultFile);
  // One headless read-only browser for the whole host: research batches from
  // every lane share it, and it holds no state a lane could leak through.
  const reader = new HeadlessReader(
    new NavigationPolicy({ fileRoots: [], allowHosts: [], denyHosts: [] }),
  );
  const shared = { ...sharedOf(parts, sandbox), vault, reader };
  // Built eagerly and pinned into the factory: the CLI and the shutdown path
  // hold this lane's parts directly, so it must be the same object the
  // manager serves for `null`.
  const lane = wireLane(shared, null);
  const lanes = new ChatLanes(
    (conversation): Lane =>
      conversation === null ? lane : wireLane(shared, conversation),
    laneCapFor(sandbox.browserRegistry.cap),
  );
  return {
    ...parts,
    ...sandbox,
    dispatch: lane.dispatch,
    session: lane.session,
    buyer: lane.buyer,
    hub: lane.hub,
    beats: lane.store,
    beatLog: shared.beats.log,
    contextLog: shared.contextLog,
    chat: lane.chat,
    lanes,
    amend: wireAmendFlow(parts),
    vault,
  };
}
