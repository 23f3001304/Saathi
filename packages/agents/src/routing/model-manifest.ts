import type { AgentProviderId } from "../providers/provider-config.js";

/**
 * The offline ladder. Discovery is the source of truth; this is what the
 * router uses when the network is gone, the endpoint has moved, or the key is
 * scoped too narrowly to list anything — a judge cloning the repo on a plane
 * still gets a working system rather than an empty candidate set.
 *
 * Two or three rungs per provider, cheapest first, ids read off each vendor's
 * current model documentation. It is deliberately short: a fallback nobody can
 * check by eye is a fallback nobody maintains.
 */
export const STATIC_MODEL_MANIFEST: Readonly<
  Record<AgentProviderId, readonly string[]>
> = {
  openai: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
  gemini: ["gemini-3.7-flash", "gemini-3.1-pro-preview"],
  sarvam: ["sarvam-105b-conversations", "sarvam-105b"],
};
