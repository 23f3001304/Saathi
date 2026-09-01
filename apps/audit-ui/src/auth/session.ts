import type { AuthProfile, SigningKeyRecord } from "./types.ts";

// Session persistence. Every access is wrapped: Safari private windows and
// hardened profiles throw on `localStorage` itself, not merely on write, so
// even reading is a guarded operation. Storage here is a convenience — the
// app must open, and sign in again, when it is unavailable.

const STORAGE_KEY = "covenant-auth";

/**
 * What survives a reload. Note what does not: the ID token. It was a
 * one-time proof of identity, it expires within the hour, and keeping it
 * would create a bearer credential in a place a script can read. We keep
 * the name to draw and the thumbprint of the key that does the real work.
 */
export type PersistedSession = {
  profile: AuthProfile;
  signingKey: SigningKeyRecord | null;
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

function parseKey(value: unknown): SigningKeyRecord | null {
  if (!isRecord(value)) return null;
  const thumbprint = asString(value["thumbprint"], "");
  if (thumbprint === "") return null;
  return {
    thumbprint,
    algorithm: "ES256",
    createdAt: asString(value["createdAt"], ""),
  };
}

function parseSession(value: unknown): PersistedSession | null {
  if (!isRecord(value)) return null;
  const profile = parseProfile(value["profile"]);
  if (profile === null) return null;
  return { profile, signingKey: parseKey(value["signingKey"]) };
}

export function readStoredSession(): PersistedSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return parseSession(JSON.parse(raw));
  } catch {
    // Unavailable storage, or a half-written value from a killed tab.
    // Either way the honest answer is the same: nobody is signed in.
    return null;
  }
}

export function writeStoredSession(session: PersistedSession): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // A private window costs the user a re-sign-in next visit, not the app.
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: if the write never landed, there is nothing to clear.
  }
}
