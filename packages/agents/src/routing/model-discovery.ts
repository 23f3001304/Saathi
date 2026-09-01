import type { Clock } from "@covenant/domain";

import type { AgentProviderId } from "../providers/provider-config.js";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  JsonTransport,
  ProviderTransportError,
} from "../providers/provider-transport.js";
import { DISCOVERY_ENDPOINTS } from "./discovery-endpoints.js";

/**
 * "What can this key actually reach?" — asked of the provider, never assumed.
 * A port because the answer arrives over the network and every test of the
 * router must be able to give it without one.
 */
export interface ModelDiscovery {
  discover(
    provider: AgentProviderId,
    apiKey: string,
  ): Promise<readonly string[]>;
}

export class HttpModelDiscovery implements ModelDiscovery {
  constructor(
    private readonly fetchImpl: typeof fetch,
    private readonly timeoutMs: number = DEFAULT_PROVIDER_TIMEOUT_MS,
  ) {}

  async discover(
    provider: AgentProviderId,
    apiKey: string,
  ): Promise<readonly string[]> {
    const endpoint = DISCOVERY_ENDPOINTS[provider];
    const transport = new JsonTransport(this.fetchImpl, {
      provider,
      timeoutMs: this.timeoutMs,
    });
    return endpoint.read(
      await transport.get(endpoint.url, endpoint.headers(apiKey)),
    );
  }
}

export const DEFAULT_DISCOVERY_TTL_MS = 15 * 60_000;

/** A failed list is cached too, briefly: one outage must not become one call
 *  per turn against an endpoint that is already refusing. */
export const DEFAULT_DISCOVERY_FAILURE_TTL_MS = 60_000;

export interface DiscoveryCacheConfig {
  readonly ttlMs: number;
  readonly failureTtlMs: number;
}

export const DEFAULT_DISCOVERY_CACHE: DiscoveryCacheConfig = {
  ttlMs: DEFAULT_DISCOVERY_TTL_MS,
  failureTtlMs: DEFAULT_DISCOVERY_FAILURE_TTL_MS,
};

interface CacheEntry {
  /** `null` records that the last attempt failed, and why. */
  readonly ids: readonly string[] | null;
  readonly detail: string;
  readonly expiresAt: number;
}

/**
 * TTL cache in front of any `ModelDiscovery`. It caches the outcome, not the
 * decision: a failure still throws, so the catalog builder is the single place
 * that decides to fall back to the manifest.
 */
export class CachingModelDiscovery implements ModelDiscovery {
  private readonly entries = new Map<AgentProviderId, CacheEntry>();

  constructor(
    private readonly inner: ModelDiscovery,
    private readonly clock: Clock,
    private readonly config: DiscoveryCacheConfig = DEFAULT_DISCOVERY_CACHE,
  ) {}

  async discover(
    provider: AgentProviderId,
    apiKey: string,
  ): Promise<readonly string[]> {
    const cached = this.fresh(provider);
    if (cached !== null) {
      return replay(provider, cached);
    }
    return this.refresh(provider, apiKey);
  }

  private fresh(provider: AgentProviderId): CacheEntry | null {
    const entry = this.entries.get(provider);
    if (entry === undefined || entry.expiresAt <= this.clock.now().getTime()) {
      return null;
    }
    return entry;
  }

  private async refresh(
    provider: AgentProviderId,
    apiKey: string,
  ): Promise<readonly string[]> {
    try {
      const ids = await this.inner.discover(provider, apiKey);
      this.store(provider, ids, "", this.config.ttlMs);
      return ids;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "unreachable";
      this.store(provider, null, detail, this.config.failureTtlMs);
      throw cause;
    }
  }

  private store(
    provider: AgentProviderId,
    ids: readonly string[] | null,
    detail: string,
    ttlMs: number,
  ): void {
    this.entries.set(provider, {
      ids,
      detail,
      expiresAt: this.clock.now().getTime() + ttlMs,
    });
  }
}

function replay(
  provider: AgentProviderId,
  entry: CacheEntry,
): never | readonly string[] {
  if (entry.ids === null) {
    throw new ProviderTransportError(provider, null, entry.detail);
  }
  return entry.ids;
}
