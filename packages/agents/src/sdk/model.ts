export type Env = Readonly<Record<string, string | undefined>>;

/** The environment's default; overridable so a demo can drop to a cheaper tier. */
export const DEFAULT_AGENT_MODEL = "claude-opus-5";

export const MODEL_ENV_KEY = "COVENANT_AGENT_MODEL";

export const API_KEY_ENV_KEY = "ANTHROPIC_API_KEY";

export function resolveModel(env: Env): string {
  const configured = env[MODEL_ENV_KEY];
  return configured !== undefined && configured.length > 0
    ? configured
    : DEFAULT_AGENT_MODEL;
}

/**
 * The live-SDK gate. Absent credentials are a skip, never a failure: the
 * conversation logic is covered against a scripted session, and a CI box
 * without a key must still go green.
 */
export function hasApiKey(env: Env): boolean {
  const key = env[API_KEY_ENV_KEY];
  return typeof key === "string" && key.length > 0;
}
