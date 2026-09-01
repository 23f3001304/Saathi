// The identity port. Read the shape carefully: nothing on it can produce a
// signature. An adapter can tell this app *who is here*; no adapter can tell
// it *what may be done*. That second question is answered only by a covenant
// signing key, created by the hold-to-sign ceremony (see signingKey.ts) and
// checked in exactly one place (see authority.ts).

export type IdentityKind = "google" | "demo";

/**
 * Claims lifted from an ID token for DISPLAY ONLY. The JWT signature is not
 * verified in the browser and these fields are never treated as authority —
 * a name to draw on the screen, nothing more. Anything that must be trusted
 * about the identity is re-verified server-side against Google's JWKS.
 */
export type AuthProfile = {
  kind: IdentityKind;
  /** The `sub` claim: Google's stable, opaque account id. */
  subject: string;
  name: string;
  email: string;
  pictureUrl: string | null;
};

/**
 * The covenant signing key, as this screen can honestly describe it: the
 * public thumbprint, and when it was made. Private key material is not in
 * this record and never passes through the sign-in flow.
 */
export type SigningKeyRecord = {
  thumbprint: string;
  algorithm: "ES256";
  createdAt: string;
};

/**
 * signed-out  — nobody here.
 * signed-in   — a human is identified, and can buy exactly nothing.
 * key-created — the ceremony just completed; the seal is drawing.
 * ready        — identity bound to a key; the app proper opens.
 */
export type AuthStatus = "signed-out" | "signed-in" | "key-created" | "ready";

export type AuthSession = {
  status: AuthStatus;
  profile: AuthProfile | null;
  signingKey: SigningKeyRecord | null;
};

export type IdentityHandlers = {
  onIdentity: (profile: AuthProfile) => void;
  onError: (message: string) => void;
};

export type IdentityPort = {
  readonly kind: IdentityKind;
  /**
   * Hand the provider a container to draw its own sign-in affordance into
   * (Google requires its rendered button rather than a look-alike).
   * Returns the teardown.
   */
  attach(container: HTMLElement): () => void;
  /** The explicit trigger: One Tap for Google, immediate for demo. */
  signIn(): void;
  signOut(): void;
};

export type IdentityFactory = (handlers: IdentityHandlers) => IdentityPort;
