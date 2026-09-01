import type { Clock } from "@covenant/domain";
import {
  CandidateSource,
  KAnonymizer,
  MathRandomSource,
  PriceAnchorAnalyzer,
  RecommendationService,
  RegretWeighter,
} from "@covenant/recs";

import type { ObsParts } from "./obs-wiring.js";
import type { StoreParts } from "./store-wiring.js";

/**
 * The flywheel's serving side (§2.6). It reads the ledger's projections on the
 * **read-only** handle: a recommendation must never be able to influence a
 * verdict, and giving it no write handle is how that is enforced rather than
 * promised. The embedder is `null` — no local model ships with the demo — so
 * `CandidateSource` falls back to its lexical ranking.
 */
export function wireRecs(
  stores: StoreParts,
  obs: ObsParts,
  clock: Clock,
): RecommendationService {
  return new RecommendationService(
    new CandidateSource(stores.memoryStore, null, clock),
    new RegretWeighter(stores.readDb),
    new KAnonymizer(new MathRandomSource()),
    new PriceAnchorAnalyzer(stores.readDb, clock),
    obs.tracer,
  );
}
