import type { AuthProfile, IdentityHandlers, IdentityPort } from "./types.ts";

/**
 * The no-client-id path. It does not imitate Google, borrow its button, or
 * claim a real person: it is a local, made-up identity, labelled as one
 * everywhere it appears (`kind: "demo"` drives that copy in the UI).
 *
 * It is also not a back door. A demo identity gets the same thing a Google
 * identity gets — a name on the screen — and the same purchasing authority:
 * none, until the key ceremony runs.
 */
const DEMO_PROFILE: AuthProfile = {
  kind: "demo",
  subject: "demo-local",
  name: "Demo user",
  email: "demo@localhost",
  pictureUrl: null,
};

export function createDemoIdentity(handlers: IdentityHandlers): IdentityPort {
  return {
    kind: "demo",
    attach() {
      // Nothing to render: the screen draws its own clearly-labelled
      // "Continue as a demo user" button rather than a Google look-alike.
      return () => undefined;
    },
    signIn() {
      handlers.onIdentity({ ...DEMO_PROFILE });
    },
    signOut() {
      // Nothing to revoke: no token was ever issued, and no third party was
      // ever told this person exists. Clearing the local session is the
      // whole of it (AuthProvider does that part).
    },
  };
}
