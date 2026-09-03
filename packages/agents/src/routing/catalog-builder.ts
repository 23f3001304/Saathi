import type { Logger } from "@covenant/domain";

import type { AgentProviderId, Env } from "../providers/provider-config.js";
import {
  AGENT_PROVIDERS,
  hasProviderApiKey,
  resolveProviderApiKey,
} from "../providers/provider-config.js";
import { capabilitiesFor, lookupCapabilities } from "./capability-table.js";
import type { CatalogModel, ModelCatalogSource } from "./model-catalog.js";
import type { ModelDiscovery } from "./model-discovery.js";
import { STATIC_MODEL_MANIFEST } from "./model-manifest.js";

export interface CatalogBuilderDeps {
  readonly env: Env;
  readonly discovery: ModelDiscovery;
  readonly logger: Logger;
  /**
   * Which providers this catalogue may draw on. Absent means every provider
   * in the registry. A deployment that answers on a subset names it here, as
   * a filter on the pool rather than a pin: a pinned model only takes the
   * opening rung, and one unconfident turn would climb past it.
   */
  readonly providers?: readonly AgentProviderId[];
}

function modelsOf(
  provider: AgentProviderId,
  ids: readonly string[],
  source: "discovered" | "manifest",
): readonly CatalogModel[] {
  return ids.map((id) => ({
    provider,
    id,
    capabilities: capabilitiesFor(provider, id),
    source,
  }));
}

/**
 * `GET /v1/models` on OpenAI returns embeddings, speech and image ids too.
 * Keeping only ids whose family this repo has declared is what stops the ladder
 * filling with models that cannot hold a conversation, and it costs nothing:
 * the families are prefixes, so a snapshot released today still matches.
 */
function known(
  provider: AgentProviderId,
  ids: readonly string[],
): readonly string[] {
  return ids.filter((id) => lookupCapabilities(provider, id) !== null);
}

async function discoverOne(
  provider: AgentProviderId,
  deps: CatalogBuilderDeps,
): Promise<readonly CatalogModel[]> {
  const fallback = STATIC_MODEL_MANIFEST[provider];
  try {
    const ids = known(
      provider,
      await deps.discovery.discover(
        provider,
        resolveProviderApiKey(deps.env, provider),
      ),
    );
    if (ids.length > 0) {
      return modelsOf(provider, ids, "discovered");
    }
    deps.logger.warn("router.discovery.empty", { provider });
  } catch (cause) {
    deps.logger.warn("router.discovery.failed", {
      provider,
      detail: cause instanceof Error ? cause.message : "unreachable",
    });
  }
  return modelsOf(provider, fallback, "manifest");
}

/**
 * The candidate set: every model reachable by a key this process actually
 * holds. A provider with no key is skipped in silence — it is a fact about the
 * deployment, not a fault, and an operator with one key should never see four
 * errors about the three they did not configure.
 */
export async function buildModelCatalog(
  deps: CatalogBuilderDeps,
): Promise<readonly CatalogModel[]> {
  const allowed = deps.providers ?? AGENT_PROVIDERS;
  const keyed = AGENT_PROVIDERS.filter(
    (id) => allowed.includes(id) && hasProviderApiKey(deps.env, id),
  );
  const found = await Promise.all(
    keyed.map((provider) => discoverOne(provider, deps)),
  );
  const models = found.flat();
  deps.logger.info("router.catalog.built", {
    providers: keyed.join(","),
    models: models.length,
  });
  return models;
}

/** Rebuilds on demand; `CachingModelDiscovery` is what keeps that cheap. */
export class DiscoveredCatalogSource implements ModelCatalogSource {
  constructor(private readonly deps: CatalogBuilderDeps) {}

  catalog(): Promise<readonly CatalogModel[]> {
    return buildModelCatalog(this.deps);
  }
}
