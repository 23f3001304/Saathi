export type Env = Readonly<Record<string, string | undefined>>;

export const MODEL_ENV_KEY = "COVENANT_AGENT_MODEL";

/** The package default, and OpenAI's: overridable so a demo can drop to a
 *  cheaper tier. Read off OpenAI's live model page, never from memory. */
export const DEFAULT_AGENT_MODEL = "gpt-5.6";

/** The providers a Covenant agent can run on. `openai` is the default, and at
 *  present the only one: the registry is what makes a second one an entry
 *  rather than an edit. */
export const AGENT_PROVIDERS = ["openai"] as const;

export type AgentProviderId = (typeof AGENT_PROVIDERS)[number];

export const PROVIDER_ENV_KEY = "COVENANT_AGENT_PROVIDER";

export const DEFAULT_AGENT_PROVIDER: AgentProviderId = "openai";

export interface ProviderSpec {
  readonly id: AgentProviderId;
  /** Read off the provider's live docs, never from memory — see the tests. */
  readonly defaultModel: string;
  /** A list of one today. Kept plural because a vendor that renames its
   *  variable should be a second entry here and nothing else. */
  readonly apiKeyEnvKeys: readonly string[];
  readonly baseUrl: string;
}

export const PROVIDER_SPECS: Readonly<Record<AgentProviderId, ProviderSpec>> = {
  openai: {
    id: "openai",
    defaultModel: DEFAULT_AGENT_MODEL,
    apiKeyEnvKeys: ["OPENAI_API_KEY"],
    baseUrl: "https://api.openai.com/v1",
  },
};

/**
 * A configuration failure, not a verdict. `DomainError` carries a `ReasonCode`
 * from a closed taxonomy owned by `@covenant/domain`, and "you forgot an env
 * var" is not one of them. Naming the variable is the entire point of the
 * type: the operator has to be told which one to set.
 */
export class ProviderConfigError extends Error {
  readonly provider: string;
  readonly envVars: readonly string[];

  constructor(
    message: string,
    provider: string,
    envVars: readonly string[] = [],
  ) {
    super(message);
    this.name = "ProviderConfigError";
    this.provider = provider;
    this.envVars = envVars;
  }
}

function isProviderId(value: string): value is AgentProviderId {
  return (AGENT_PROVIDERS as readonly string[]).includes(value);
}

function nonEmpty(env: Env, key: string): string | null {
  const value = env[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function resolveProviderId(env: Env): AgentProviderId {
  const configured = nonEmpty(env, PROVIDER_ENV_KEY);
  if (configured === null) {
    return DEFAULT_AGENT_PROVIDER;
  }
  if (!isProviderId(configured)) {
    throw new ProviderConfigError(
      `${PROVIDER_ENV_KEY}="${configured}" is not a known provider. ` +
        `Expected one of: ${AGENT_PROVIDERS.join(", ")}.`,
      configured,
      [PROVIDER_ENV_KEY],
    );
  }
  return configured;
}

/** `COVENANT_AGENT_MODEL_<PROVIDER>` pins one provider; `COVENANT_AGENT_MODEL`
 *  moves them all. The narrower key wins, so the day a second provider is
 *  added one of them can be moved without disturbing the other. */
export function providerModelEnvKey(id: AgentProviderId): string {
  return `${MODEL_ENV_KEY}_${id.toUpperCase()}`;
}

export function resolveProviderModel(env: Env, id: AgentProviderId): string {
  return (
    nonEmpty(env, providerModelEnvKey(id)) ??
    nonEmpty(env, MODEL_ENV_KEY) ??
    PROVIDER_SPECS[id].defaultModel
  );
}

export function resolveProviderApiKey(env: Env, id: AgentProviderId): string {
  const spec = PROVIDER_SPECS[id];
  for (const key of spec.apiKeyEnvKeys) {
    const value = nonEmpty(env, key);
    if (value !== null) {
      return value;
    }
  }
  throw new ProviderConfigError(
    `No API key for provider "${id}": set ${spec.apiKeyEnvKeys.join(" or ")}.`,
    id,
    spec.apiKeyEnvKeys,
  );
}

/** Absent credentials gate a live smoke test; they never fail a suite. */
export function hasProviderApiKey(env: Env, id: AgentProviderId): boolean {
  return PROVIDER_SPECS[id].apiKeyEnvKeys.some(
    (key) => nonEmpty(env, key) !== null,
  );
}
