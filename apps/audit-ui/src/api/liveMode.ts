// Which side of the seam this page is on.
//
// DECISION: live is opt-in and fixtures are the floor, inverted from "real
// unless told otherwise". Why: an unconfigured build that reaches for a
// gateway nobody started shows an empty ledger and a dead chat, and an empty
// screen is indistinguishable from a broken one. Fixtures are labelled as
// fixtures everywhere they are used, so the calm default is honest; pointing
// at real servers is `VITE_AGENT_URL` / `VITE_GATEWAY_URL`, or `?live=1` for
// the compose stack's published ports without a rebuild.
import { isFixtureMode } from "../ledger/fixtureMode.ts";

const DEFAULT_AGENT_URL = "http://localhost:8788";
const DEFAULT_GATEWAY_URL = "http://localhost:8787";

function trimmed(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  return value.trim().replace(/\/+$/, "");
}

/** Vite only substitutes statically-spelled `import.meta.env.VITE_*` reads. */
function configuredAgentUrl(): string | null {
  return trimmed(import.meta.env.VITE_AGENT_URL as string | undefined);
}

function configuredGatewayUrl(): string | null {
  return trimmed(import.meta.env.VITE_GATEWAY_URL as string | undefined);
}

/** `?live=1` — the presenter's override, and the only one a URL can carry. */
export function liveForced(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("live") === "1";
}

function baseUrl(configured: string | null, fallback: string): string | null {
  if (isFixtureMode() && !liveForced()) return null;
  if (configured !== null) return configured;
  return liveForced() ? fallback : null;
}

/** `null` means "run the fixture reel" — never "guess at a URL". */
export function agentBaseUrl(): string | null {
  return baseUrl(configuredAgentUrl(), DEFAULT_AGENT_URL);
}

export function gatewayBaseUrl(): string | null {
  return baseUrl(configuredGatewayUrl(), DEFAULT_GATEWAY_URL);
}

/** True when the REST resources should hit a real gateway rather than fixtures. */
export function isLive(): boolean {
  return gatewayBaseUrl() !== null;
}
