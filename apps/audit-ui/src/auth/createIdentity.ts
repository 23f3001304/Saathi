import { createDemoIdentity } from "./demoIdentity.ts";
import { createGoogleIdentity } from "./googleIdentity.ts";
import type { IdentityHandlers, IdentityPort } from "./types.ts";

/**
 * The OAuth client id, from `VITE_GOOGLE_CLIENT_ID`. It is a public
 * identifier, not a secret — Google publishes it in the page — but it is
 * still build configuration and is not committed: set it in a local `.env`
 * (see `.env.example`) or in the deployment environment.
 */
export function readGoogleClientId(): string {
  const raw: unknown = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Pick the adapter. Absent a client id we degrade to an explicit, labelled
 * demo path rather than rendering a dead Google button or, worse, a
 * home-made one that looks like Google's.
 */
export function createIdentity(handlers: IdentityHandlers): IdentityPort {
  const clientId = readGoogleClientId();
  if (clientId === "") return createDemoIdentity(handlers);
  return createGoogleIdentity(clientId, handlers);
}
