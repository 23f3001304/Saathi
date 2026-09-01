import type { AuthSession } from "./types.ts";

/**
 * The feature's whole argument, in one predicate.
 *
 * Google identifies; it does not authorise. So this function reads exactly
 * one field — the signing key — and never looks at the profile. There is no
 * claim in an ID token, no verified-email flag, no hosted-domain, no length
 * of session, that can promote an identity into spending power. A person
 * signed in with a genuine, freshly-issued Google credential and no covenant
 * key has precisely the purchasing authority of a stranger: none.
 *
 * Every path that could move money must ask this, and the only way to make
 * it true is `createSigningKey()` behind the hold-to-sign ceremony.
 */
export function canSign(session: AuthSession): boolean {
  return session.signingKey !== null;
}

/** The same fact, in the assistant's voice, for the screens that say it. */
export function authorityNote(session: AuthSession): string {
  if (session.signingKey === null) {
    return "Signed in, but nothing can be bought yet: there is no signing key.";
  }
  return `Purchases need a signature from ${session.signingKey.thumbprint}. Signing in never produces one.`;
}
