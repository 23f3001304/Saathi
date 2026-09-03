import type { AgentProviderId } from "../providers/provider-config.js";
import type { ProviderHeaders } from "../providers/provider-transport.js";
import { asRecord, recordsAt, stringAt } from "../providers/wire-json.js";

export interface DiscoveryEndpoint {
  readonly url: string;
  readonly headers: (apiKey: string) => ProviderHeaders;
  readonly read: (body: unknown) => readonly string[];
}

/** OpenAI answers `{ data: [{ id }] }`. */
function idsAt(key: string): (body: unknown) => readonly string[] {
  return (body) =>
    recordsAt(asRecord(body) ?? {}, key)
      .map((entry) => stringAt(entry, "id"))
      .filter((id) => id.length > 0);
}

/**
 * Read off the vendor's current reference before it was written, not recalled:
 *
 * - OpenAI     GET https://api.openai.com/v1/models
 *              `Authorization: Bearer <key>` → `{object:"list", data:[{id,…}]}`
 */
export const DISCOVERY_ENDPOINTS: Readonly<
  Record<AgentProviderId, DiscoveryEndpoint>
> = {
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (apiKey) => ({ authorization: `Bearer ${apiKey}` }),
    read: idsAt("data"),
  },
};
