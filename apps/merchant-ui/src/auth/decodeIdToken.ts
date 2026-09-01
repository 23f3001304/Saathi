// NOTE: a verbatim copy of apps/audit-ui/src/auth/decodeIdToken.ts. Two apps, one
// sign-in contract, and no shared package to hang it on — a cross-app import
// would make the shopper's app a build dependency of the shopkeeper's, which is
// exactly the coupling splitting them was for. Keep it byte-identical below
// this note: divergence here is a bug in one of the two doorsteps.
import type { AuthProfile } from "./types.ts";

// The ID token is a JWT; its middle segment is base64url-encoded JSON. We
// read it to draw a name and an avatar, and for nothing else.
//
// DECISION: no signature check here, and none is wanted. Verifying a JWT in
// the same browser that received it proves nothing an attacker could not
// also arrange — real verification (Google's JWKS, `aud`, `iss`, `exp`)
// belongs on the server that would act on the claim. Since this app never
// acts on the claim — identity is not authority; see authority.ts — the
// honest client-side treatment is: decode, display, distrust.

type Claims = Record<string, unknown>;

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function base64UrlToText(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  const padded = remainder === 0 ? base64 : base64 + "=".repeat(4 - remainder);
  // atob yields Latin-1 bytes; names in ID tokens are UTF-8 (Devanagari,
  // accents, CJK all arrive mangled without this second step).
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toProfile(claims: Claims): AuthProfile | null {
  const subject = asString(claims["sub"], "");
  if (subject === "") return null;
  const email = asString(claims["email"], "");
  const picture = asString(claims["picture"], "");
  return {
    kind: "google",
    subject,
    name: asString(claims["name"], email === "" ? "Signed in" : email),
    email,
    pictureUrl: picture === "" ? null : picture,
  };
}

/**
 * Decode a Google ID token into display claims. Returns null for anything
 * that is not a well-formed JWT carrying a `sub` — a malformed credential
 * simply does not sign anyone in.
 */
export function decodeProfileForDisplay(idToken: string): AuthProfile | null {
  const payload = idToken.split(".")[1];
  if (payload === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(base64UrlToText(payload));
    if (typeof parsed !== "object" || parsed === null) return null;
    return toProfile(parsed as Claims);
  } catch {
    return null;
  }
}
