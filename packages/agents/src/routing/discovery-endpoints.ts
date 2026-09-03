import type { AgentProviderId } from "../providers/provider-config.js";
import type { ProviderHeaders } from "../providers/provider-transport.js";
import { asRecord, recordsAt, stringAt } from "../providers/wire-json.js";

export interface DiscoveryEndpoint {
  readonly url: string;
  readonly headers: (apiKey: string) => ProviderHeaders;
  readonly read: (body: unknown) => readonly string[];
}

/** OpenAI and Sarvam both answer `{ data: [{ id }] }`. */
function idsAt(key: string): (body: unknown) => readonly string[] {
  return (body) =>
    recordsAt(asRecord(body) ?? {}, key)
      .map((entry) => stringAt(entry, "id"))
      .filter((id) => id.length > 0);
}

/** Google returns `models[].name` as `models/<id>`; the API wants the bare id. */
function googleNames(body: unknown): readonly string[] {
  return recordsAt(asRecord(body) ?? {}, "models")
    .map((entry) => stringAt(entry, "name").replace(/^models\//, ""))
    .filter((name) => name.length > 0);
}

/**
 * Every one of these was read off the vendor's current reference before it was
 * written, not recalled:
 *
 * - OpenAI     GET https://api.openai.com/v1/models
 *              `Authorization: Bearer <key>` → `{object:"list", data:[{id,…}]}`
 * - Google     GET https://generativelanguage.googleapis.com/v1beta/models
 *              `x-goog-api-key` → `{models:[{name:"models/…",…}]}`
 * - Sarvam     GET https://api.sarvam.ai/v2/models
 *              Documented as **unauthenticated**, listing only what the caller's
 *              account can reach. The response body is not shown in the docs, so
 *              the reader takes the OpenAI-compatible `{data:[{id}]}` shape —
 *              the same shape Sarvam's chat surface follows — and anything else
 *              reads as zero ids, which drops the provider to the manifest.
 *
 * The header is still sent for Sarvam when a key exists: an unauthenticated
 * endpoint that later starts scoping by key should keep working, and sending a
 * credential to the vendor that issued it costs nothing.
 */
export const DISCOVERY_ENDPOINTS: Readonly<
  Record<AgentProviderId, DiscoveryEndpoint>
> = {
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
    read: idsAt("data"),
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: (apiKey) => ({ "x-goog-api-key": apiKey }),
    read: googleNames,
  },
  sarvam: {
    url: "https://api.sarvam.ai/v2/models",
    headers: (apiKey) => ({ "api-subscription-key": apiKey }),
    read: idsAt("data"),
  },
};
