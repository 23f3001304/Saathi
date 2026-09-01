// Which side of the seam this page is on, and the wire it speaks.
//
// The shopkeeper's app talks to the same gateway the shopper's app does, over
// plain HTTP, and holds no database of its own. Live is opt-in and fixtures
// are the floor: an unconfigured build that reached for a server nobody
// started would show an empty shop, and an empty shop is indistinguishable
// from a broken one.

/** gateway-svc pins the semantic version on every header-checked read route. */
export const API_VERSION = "2026-08-31";

const DEFAULT_GATEWAY_URL = "http://localhost:8787";

function trimmed(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  return value.trim().replace(/\/+$/, "");
}

/** Vite only substitutes statically-spelled `import.meta.env.VITE_*` reads. */
function configuredGatewayUrl(): string | null {
  return trimmed(import.meta.env.VITE_GATEWAY_URL as string | undefined);
}

/** `?live=1` — the presenter's override, and the only one a URL can carry. */
export function liveForced(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("live") === "1";
}

/** `null` means "run the fixture shelf" — never "guess at a URL". */
export function gatewayBaseUrl(): string | null {
  const configured = configuredGatewayUrl();
  if (configured !== null) return configured;
  return liveForced() ? DEFAULT_GATEWAY_URL : null;
}

export function isLive(): boolean {
  return gatewayBaseUrl() !== null;
}

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
  if (!res.ok) throw new Error(`${path} → ${res.status.toString()}`);
  return (await res.json()) as T;
}
