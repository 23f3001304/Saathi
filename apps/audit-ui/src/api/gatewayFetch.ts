// The gateway wire: headers, base URL, and the two verbs every read route
// needs. Split out of `gateway.ts` so more than one module can speak to the
// gateway without either of them owning the connection.
import { gatewayBaseUrl } from "./liveMode.ts";

/** gateway-svc pins the semantic version on every header-checked read route. */
export const API_VERSION = "2026-08-31";

export function readHeaders(): Record<string, string> {
  return { "Request-Id": crypto.randomUUID(), "API-Version": API_VERSION };
}

function base(): string {
  const url = gatewayBaseUrl();
  if (url === null) throw new Error("gateway is not configured");
  return url;
}

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: readHeaders() });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers:
      body === undefined
        ? readHeaders()
        : { ...readHeaders(), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}
