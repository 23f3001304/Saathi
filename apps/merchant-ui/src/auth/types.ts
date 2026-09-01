// The shopkeeper's identity port, and the seam between two different claims.
//
// An identity provider can tell this app *who is at the keyboard*. It cannot
// tell it *which shop they own*, and it cannot authorise a change to that
// shop's inventory. Those are answered by two other things: the pinned trust
// ring, which lists the shops this gateway will believe at all, and the
// merchant signing key, which is the only thing an inventory write accepts.

export type IdentityKind = "google" | "demo";

/**
 * Claims lifted from an ID token for DISPLAY ONLY. The JWT signature is not
 * verified in the browser and these fields are never treated as authority — a
 * name to draw in the corner, nothing more.
 */
export type AuthProfile = {
  kind: IdentityKind;
  /** The `sub` claim: the provider's stable, opaque account id. */
  subject: string;
  name: string;
  email: string;
  pictureUrl: string | null;
};

/**
 * A shop, as the pinned trust ring describes it. The slug is what the trust
 * fold, the demand fold and the leakage fold all key on; the issuer URN is
 * what a signed quote carries. One is the tail of the other.
 */
export type Shop = {
  slug: string;
  issuer: string;
  kids: readonly string[];
};

/**
 * signed-out — nobody here.
 * signed-in  — a person is identified, and no shop is selected yet.
 * ready      — a person, looking at one shop's folds.
 *
 * There is deliberately no state above `ready`. Selecting a shop opens its
 * reads; it never opens a write. Writes ask the signing key, and the signing
 * key is not part of this machine.
 */
export type AuthStatus = "signed-out" | "signed-in" | "ready";

export type AuthSession = {
  status: AuthStatus;
  profile: AuthProfile | null;
  shop: Shop | null;
};

export type IdentityHandlers = {
  onIdentity: (profile: AuthProfile) => void;
  onError: (message: string) => void;
};

export type IdentityPort = {
  readonly kind: IdentityKind;
  /** Hand the provider a container to draw its own button into. */
  attach(container: HTMLElement): () => void;
  signIn(): void;
  signOut(): void;
};

export type IdentityFactory = (handlers: IdentityHandlers) => IdentityPort;
