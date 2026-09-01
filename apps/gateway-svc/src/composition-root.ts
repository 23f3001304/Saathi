import type {
  Clock,
  IdGenerator,
  ItemCatalog,
  PaymentRail,
} from "@covenant/domain";
import type { RecommendationService } from "@covenant/recs";

import { RandomIds, SystemClock } from "./adapters/system-ports.js";
import type { GatewayConfig } from "./config.js";
import { DrainGate } from "./shutdown.js";
import { wireFolds } from "./wiring/fold-wiring.js";
import { wireItems } from "./wiring/items-wiring.js";
import type { FoldParts } from "./wiring/fold-wiring.js";
import { bootstrapKeys, wireKeys } from "./wiring/key-wiring.js";
import type { KeyParts } from "./wiring/key-wiring.js";
import { wireMemory } from "./wiring/memory-wiring.js";
import type { MemoryParts } from "./wiring/memory-wiring.js";
import { wireObservability } from "./wiring/obs-wiring.js";
import type { ObsParts } from "./wiring/obs-wiring.js";
import { wireRail } from "./wiring/rail-wiring.js";
import { wireReadSide } from "./wiring/read-wiring.js";
import { wireRecs } from "./wiring/recs-wiring.js";
import type { ReadParts } from "./wiring/read-wiring.js";
import { wireServices } from "./wiring/service-wiring.js";
import type { ServiceParts } from "./wiring/service-wiring.js";
import { wireStores } from "./wiring/store-wiring.js";
import type { StoreParts } from "./wiring/store-wiring.js";

/** The assembled service map: everything the transport is allowed to touch. */
export interface CompositionRoot {
  readonly config: GatewayConfig;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly obs: ObsParts;
  readonly stores: StoreParts;
  readonly keys: KeyParts;
  readonly folds: FoldParts;
  readonly memory: MemoryParts;
  readonly rail: PaymentRail;
  /** `null` when no Razorpay key is configured; the merchant route answers 503. */
  readonly items: ItemCatalog | null;
  readonly services: ServiceParts;
  readonly read: ReadParts;
  readonly drain: DrainGate;
  /** `null` only in a build without the flywheel; the route answers 501. */
  readonly recs: RecommendationService | null;
}

/**
 * The only file tree where collaborators are `new`ed (§12, enforced by
 * depcruise): `src/wiring/*` builds each layer and this function orders them.
 * The order is the dependency order and nothing else — observability first
 * because every later layer logs, stores before folds because a fold reads the
 * ledger, keys before services because a service verifies a mandate.
 */
export async function buildRoot(
  config: GatewayConfig,
): Promise<CompositionRoot> {
  const clock = new SystemClock();
  const ids = new RandomIds();
  const obs = wireObservability(config);
  await bootstrapKeys(config, clock, obs.logger);
  const stores = wireStores(config, obs, clock, ids);
  const folds = wireFolds(stores, obs, clock);
  const keys = wireKeys(config, clock, ids, obs.logger);
  const memory = wireMemory(config, obs, stores, keys, clock, ids, folds);
  const rail = wireRail(config, obs, clock);
  const items = wireItems(config, obs, clock);
  const drain = new DrainGate();
  return {
    config,
    clock,
    ids,
    obs,
    stores,
    keys,
    folds,
    memory,
    rail,
    items,
    drain,
    recs: wireRecs(stores, obs, clock),
    services: wireServices({ config, obs, stores, keys, rail, clock, ids }),
    read: wireReadSide(config, stores, folds, keys, memory, drain, clock),
  };
}
