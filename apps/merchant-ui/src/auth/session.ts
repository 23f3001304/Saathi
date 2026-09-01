import type { AuthProfile, Shop } from "./types.ts";

// Session persistence. Every access is wrapped: Safari private windows and
// hardened profiles throw on `localStorage` itself, not merely on write, so
// even reading is a guarded operation. Storage here is a convenience — the
// app must open, and sign in again, when it is unavailable.

const STORAGE_KEY = "covenant-merchant-auth";

/**
 * What survives a reload: the name to draw, and which shop was being looked
 * at. Note what does not — the ID token, which was a one-time proof that
 * expires within the hour, and any key material, which never reaches this
 * module at all.
 */
export type PersistedSession = {
  profile: AuthProfile;
  shop: Shop | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function parseProfile(value: unknown): AuthProfile | null {
  if (!isRecord(value)) return null;
  const kind = value["kind"];
  if (kind !== "google" && kind !== "demo") return null;
  const subject = asString(value["subject"], "");
  const name = asString(value["name"], "");
  if (subject === "" || name === "") return null;
  const picture = asString(value["pictureUrl"], "");
  return {
    kind,
    subject,
    name,
    email: asString(value["email"], ""),
    pictureUrl: picture === "" ? null : picture,
  };
}

/**
 * A stored shop is a remembered *selection*, never a granted one. It is
 * re-checked against the live trust ring at boot, so a shop that has left the
 * ring cannot be read back out of storage into a session.
 */
function parseShop(value: unknown): Shop | null {
  if (!isRecord(value)) return null;
  const slug = asString(value["slug"], "");
  const issuer = asString(value["issuer"], "");
  if (slug === "" || issuer === "") return null;
  const kids = value["kids"];
  return {
    slug,
    issuer,
    kids: Array.isArray(kids) ? kids.map((kid) => asString(kid, "")) : [],
  };
}

function parseSession(value: unknown): PersistedSession | null {
  if (!isRecord(value)) return null;
  const profile = parseProfile(value["profile"]);
  if (profile === null) return null;
  return { profile, shop: parseShop(value["shop"]) };
}

export function readStoredSession(): PersistedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return parseSession(JSON.parse(raw));
  } catch {
    // Unavailable storage, or a half-written value from a killed tab. Either
    // way the honest answer is the same: nobody is signed in.
    return null;
  }
}

export function writeStoredSession(session: PersistedSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // A private window costs the shopkeeper a re-sign-in next visit.
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // If the write never landed there is nothing to clear.
  }
}
