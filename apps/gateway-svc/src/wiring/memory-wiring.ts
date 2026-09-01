import type { Clock, IdGenerator } from "@covenant/domain";
import { GATEWAY_AUDIENCE } from "@covenant/domain";
import type { ContradictionRule } from "@covenant/memory";
import {
  AuthorityClaimRule,
  BooleanFlipRule,
  ChannelTierResolver,
  MemoryDigest,
  MemoryDriftState,
  NumericRelaxationRule,
  ReadGate,
  ReconciliationJob,
  RetrievalScorer,
  RuleChain,
  ScopeWideningRule,
  TierPermissionRule,
  UnitMismatchRule,
  WriteCommitter,
  WriteGate,
} from "@covenant/memory";
import type { FoldRebuilder, StateHasher } from "@covenant/ledger";

import type { GatewayConfig } from "../config.js";
import type { ObsParts } from "./obs-wiring.js";
import type { KeyParts } from "./key-wiring.js";
import type { StoreParts } from "./store-wiring.js";

export interface MemoryParts {
  readonly writeGate: WriteGate;
  readonly readGate: ReadGate;
  readonly drift: MemoryDriftState;
  readonly reconciliation: ReconciliationJob;
}

/**
 * §9.1's rule chain, in order: the cheapest and most decisive first, so the
 * first failure ends the write and is ledgered with its rule id. R0 (tier
 * permission) is passed to the gate separately because stage 2 runs it before
 * the chain.
 */
function orderedRules(): readonly ContradictionRule[] {
  return [
    new NumericRelaxationRule(),
    new ScopeWideningRule(),
    new BooleanFlipRule(),
    new AuthorityClaimRule(),
    new UnitMismatchRule(),
  ];
}

/**
 * DECISION: `LlmContradictionJudge` is wired as `null`. Why: §9.5 makes the
 * judge a *fallback* for candidates no deterministic rule matched, and it
 * needs a `PromptJudge` adapter this service does not own — a stub that always
 * answered "no contradiction" would be worse than an absent one, because the
 * absent one fails closed at the rule chain instead of quietly passing.
 */
export function wireMemory(
  config: GatewayConfig,
  obs: ObsParts,
  stores: StoreParts,
  keys: KeyParts,
  clock: Clock,
  ids: IdGenerator,
  folds: { readonly rebuilder: FoldRebuilder; readonly hasher: StateHasher },
): MemoryParts {
  const drift = new MemoryDriftState();
  return {
    drift,
    writeGate: writeGateOf(obs, stores, keys, clock, ids),
    readGate: new ReadGate(
      stores.memoryReader,
      new RetrievalScorer(clock),
      new MemoryDigest(),
      stores.events,
      stores.ledger,
      clock,
      obs.tracer,
    ),
    reconciliation: new ReconciliationJob(
      folds.rebuilder,
      folds.hasher,
      stores.events,
      stores.ledger,
      clock,
      obs.logger,
      drift,
      config.tenantId,
    ),
  };
}

function writeGateOf(
  obs: ObsParts,
  stores: StoreParts,
  keys: KeyParts,
  clock: Clock,
  ids: IdGenerator,
): WriteGate {
  return new WriteGate(
    new ChannelTierResolver(keys.verifier, GATEWAY_AUDIENCE),
    new TierPermissionRule(),
    new RuleChain(orderedRules(), obs.tracer),
    null,
    stores.memoryReader,
    new WriteCommitter(
      stores.memoryReader,
      stores.memoryWriter,
      stores.events,
      ids,
    ),
    stores.vec,
    stores.events,
    stores.ledger,
    clock,
    obs.tracer,
  );
}
