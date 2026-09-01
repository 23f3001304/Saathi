import type { Clock } from "@covenant/domain";

import type { AgentHostConfig } from "../config.js";
import { BeatHub } from "../http/beat-hub.js";
import type { BeatLog } from "../http/beat-log.js";
import { openBeatLog } from "../http/beat-log.js";
import { ConversationBeatStore } from "../http/beat-store.js";
import type { EpochSource } from "../http/epoch-source.js";
import { SharedEpochs } from "../http/epoch-source.js";
import type { SandboxView } from "../http/chat-beat.js";
import { ChatService } from "../http/chat-service.js";
import type { BuyerParts } from "./buyer-wiring.js";
import type { GatewayParts } from "./gateway-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { ObsParts } from "./obs-wiring.js";

export interface BeatParts {
  readonly store: ConversationBeatStore;
  readonly hub: BeatHub;
}

/** The durable half, opened once for the whole host. */
export interface BeatLogParts {
  readonly log: BeatLog;
  /** Every lane's hub draws epochs here, so no two lanes share an address. */
  readonly epochs: EpochSource;
}

/** The sandbox as the conversation log may see it: a card, never a picture. */
export interface SandboxWindow {
  readonly view: () => SandboxView | null;
  readonly owner: { pendingClaim: string | null };
}

interface ChatDeps {
  readonly config: AgentHostConfig;
  readonly clock: Clock;
  readonly obs: ObsParts;
  readonly keys: KeyParts;
  readonly gateway: GatewayParts;
}

/**
 * The log and the epoch counter over it — one of each per process, however
 * many lanes run. The counter starts past the highest epoch the log has ever
 * held: a host that came back at epoch 1 would mint an address the log
 * already holds, and a client holding the first one could not tell them apart.
 */
export function wireBeatLog(
  config: AgentHostConfig,
  clock: Clock,
  obs: ObsParts,
): BeatLogParts {
  const log = openBeatLog(config.dbFile, clock, obs.logger);
  return { log, epochs: new SharedEpochs(log.lastEpoch) };
}

/**
 * One lane's store and hub over the shared log. The store is per lane because
 * its one piece of state — which conversation the hub's beats file under — is
 * exactly the state that must never be shared: a process-wide "current chat"
 * is how one lane's beats ended up in another conversation's transcript.
 */
export function wireLaneBeats(
  shared: BeatLogParts,
  clock: Clock,
  obs: ObsParts,
): BeatParts {
  const store = new ConversationBeatStore(shared.log, obs.logger);
  const hub = new BeatHub(clock, obs.logger, {
    recorder: store,
    epochs: shared.epochs,
  });
  return { store, hub };
}

export function wireChat(
  parts: ChatDeps,
  buyer: BuyerParts,
  beats: BeatParts,
  sandbox: SandboxWindow,
): ChatService {
  return new ChatService(
    buyer.runner,
    beats.hub,
    buyer.intentGate,
    buyer.cartGate,
    parts.gateway.client,
    parts.clock,
    parts.obs.logger,
    { userId: parts.keys.userIss, tenantId: parts.config.tenantId },
    {
      open: (chat, said) => beats.store.open(chat, said),
      claim: (chat) => {
        sandbox.owner.pendingClaim = chat;
      },
      sandbox: () => sandbox.view(),
    },
    buyer.webPick,
  );
}
