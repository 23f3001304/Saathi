import type { Clock } from "@covenant/domain";

import type { AgentHostConfig } from "../config.js";
import { BeatHub } from "../http/beat-hub.js";
import type { BeatLog } from "../http/beat-log.js";
import { openBeatLog } from "../http/beat-log.js";
import { ConversationBeatStore } from "../http/beat-store.js";
import type { SandboxView } from "../http/chat-beat.js";
import { ChatService } from "../http/chat-service.js";
import type { BuyerParts } from "./buyer-wiring.js";
import type { GatewayParts } from "./gateway-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { ObsParts } from "./obs-wiring.js";

export interface BeatParts {
  readonly log: BeatLog;
  readonly store: ConversationBeatStore;
  readonly hub: BeatHub;
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
 * The log, the store over it and the hub that writes through it — built
 * together because the hub's first epoch is read off the log. A host that came
 * back at epoch 1 would mint an address the log already holds.
 */
export function wireBeats(
  config: AgentHostConfig,
  clock: Clock,
  obs: ObsParts,
): BeatParts {
  const log = openBeatLog(config.dbFile, clock, obs.logger);
  const store = new ConversationBeatStore(log, obs.logger);
  const hub = new BeatHub(clock, obs.logger, {
    recorder: store,
    startEpoch: store.startEpoch,
  });
  return { log, store, hub };
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
