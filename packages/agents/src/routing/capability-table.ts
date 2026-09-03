import type { AgentProviderId } from "../providers/provider-config.js";
import type {
  CostTier,
  LatencyTier,
  ModelCapabilities,
} from "./model-catalog.js";

interface CapabilityFlags {
  readonly toolCalling?: boolean;
  readonly structuredOutput?: boolean;
  readonly vision?: boolean;
}

function caps(
  contextWindow: number,
  costTier: CostTier,
  latencyTier: LatencyTier,
  flags: CapabilityFlags = {},
): ModelCapabilities {
  return {
    contextWindow,
    costTier,
    latencyTier,
    toolCalling: flags.toolCalling ?? true,
    structuredOutput: flags.structuredOutput ?? true,
    vision: flags.vision ?? true,
  };
}

/**
 * The record handed to an id no table entry matches. Conservative in both
 * directions: it can do nothing, and it costs the most, so an unrecognised id
 * is never the cheap first pick and is never handed a job that needs tools.
 */
export const CONSERVATIVE_CAPABILITIES: ModelCapabilities = caps(
  8_192,
  "premium",
  "slow",
  { toolCalling: false, structuredOutput: false, vision: false },
);

/**
 * Families, not exact ids. A vendor ships dated snapshots
 * (`gpt-5.6-luna-2026-09-01`) faster than any table is maintained; matching on
 * the longest prefix means a snapshot released this morning routes like its
 * family instead of falling to the conservative floor.
 *
 * There is deliberately no catch-all. `GET /v1/models` lists 124 ids, most of
 * them long superseded, and a `gpt-` fallback granted every one of them
 * standard-tier tool calling, so the cheapest-capable-first cascade handed a
 * money turn to `gpt-3.5-turbo` while `gpt-5.6-luna` sat in the same catalog.
 * An id nobody declared gets the conservative record.
 *
 * Context windows and tiers are read off OpenAI's current model page; the
 * discovery call is the source of truth for *which* ids exist, this table for
 * what they can do.
 */
const FAMILIES: Readonly<
  Record<AgentProviderId, ReadonlyArray<readonly [string, ModelCapabilities]>>
> = {
  openai: [
    ["gpt-5.6-luna", caps(1_050_000, "economy", "fast")],
    ["gpt-5.6-terra", caps(1_050_000, "standard", "medium")],
    ["gpt-5.6-sol", caps(1_050_000, "premium", "slow")],
    ["gpt-5.6", caps(1_050_000, "premium", "slow")],
    ["gpt-5-nano", caps(400_000, "economy", "fast")],
  ],
};

/** The longest matching family prefix, or `null` for an id nobody declared. */
export function lookupCapabilities(
  provider: AgentProviderId,
  id: string,
): ModelCapabilities | null {
  let matched: readonly [string, ModelCapabilities] | null = null;
  for (const entry of FAMILIES[provider]) {
    const longer = matched === null || entry[0].length > matched[0].length;
    if (id.startsWith(entry[0]) && longer) {
      matched = entry;
    }
  }
  return matched === null ? null : matched[1];
}

export function capabilitiesFor(
  provider: AgentProviderId,
  id: string,
): ModelCapabilities {
  return lookupCapabilities(provider, id) ?? CONSERVATIVE_CAPABILITIES;
}
