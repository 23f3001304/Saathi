import type { AuthProfile, IdentityHandlers, IdentityPort } from "./types.ts";

/**
 * The no-client-id path. It does not imitate Google, borrow its button, or
 * claim a real person: it is a local, made-up shopkeeper, labelled as one
 * everywhere it appears (`kind: "demo"` drives that copy in the UI).
 *
 * It is also not a back door. A demo identity gets exactly what a Google
 * identity gets — a name in the corner and the right to read a shop's folds,
 * which are public arithmetic over a public ledger. It cannot change one
 * listing: that asks the signing key, and no identity produces one.
 */
const DEMO_PROFILE: AuthProfile = {
  kind: "demo",
  subject: "demo-shopkeeper",
  name: "Demo shopkeeper",
  email: "demo@localhost",
  pictureUrl: null,
};

export function createDemoIdentity(handlers: IdentityHandlers): IdentityPort {
  return {
    kind: "demo",
    attach() {
      // Nothing to render: the screen draws its own clearly-labelled button
      // rather than a Google look-alike.
      return () => undefined;
    },
    signIn() {
      handlers.onIdentity({ ...DEMO_PROFILE });
    },
    signOut() {
      // Nothing to revoke: no token was ever issued and no third party was
      // ever told this person exists.
    },
  };
}
