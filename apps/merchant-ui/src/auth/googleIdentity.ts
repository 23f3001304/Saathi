// NOTE: a verbatim copy of apps/audit-ui/src/auth/googleIdentity.ts. Two apps, one
// sign-in contract, and no shared package to hang it on — a cross-app import
// would make the shopper's app a build dependency of the shopkeeper's, which is
// exactly the coupling splitting them was for. Keep it byte-identical below
// this note: divergence here is a bug in one of the two doorsteps.
import { decodeProfileForDisplay } from "./decodeIdToken.ts";
import {
  loadGis,
  type CredentialResponse,
  type GoogleAccountsId,
  type GsiButtonConfiguration,
} from "./gis.ts";
import type { IdentityHandlers, IdentityPort } from "./types.ts";

// The GoogleIdentity adapter. Contract verified 2026-08-31 against
// developers.google.com/identity/gsi/web/reference/js-reference: initialize
// takes an IdConfiguration, renderButton(parent, options) draws Google's own
// button, prompt() raises One Tap, disableAutoSelect() is what you call on
// sign-out so the next visit does not silently re-authenticate.

/** Paper ground, ink rule, no rounded pill: Google's button as our furniture. */
const BUTTON: GsiButtonConfiguration = {
  type: "standard",
  theme: "outline",
  size: "large",
  text: "continue_with",
  shape: "rectangular",
  logo_alignment: "left",
  width: "320",
};

function receive(
  response: CredentialResponse,
  handlers: IdentityHandlers,
): void {
  const profile = decodeProfileForDisplay(response.credential);
  if (profile === null) {
    handlers.onError("Google returned a credential I could not read.");
    return;
  }
  handlers.onIdentity(profile);
}

function initialise(
  api: GoogleAccountsId,
  clientId: string,
  handlers: IdentityHandlers,
): GoogleAccountsId {
  api.initialize({
    client_id: clientId,
    callback: (response) => receive(response, handlers),
    // Never sign someone in without them asking. Auto-select would put a
    // person into a covenant flow they did not start.
    auto_select: false,
    cancel_on_tap_outside: true,
    context: "signin",
    ux_mode: "popup",
    use_fedcm_for_button: true,
  });
  return api;
}

type Loader = {
  /** Run `use` once GIS is initialised; report a failed load to the UI. */
  whenReady(use: (api: GoogleAccountsId) => void): void;
  /** The live API, or null if it was never needed. */
  current(): GoogleAccountsId | null;
};

/**
 * DECISION: the script is fetched on first *use*, not when the adapter is
 * built. The adapter is built once at app boot, but a returning visitor with
 * a stored session never sees a sign-in button — and so never needs to
 * announce their arrival to accounts.google.com.
 */
function createLoader(clientId: string, handlers: IdentityHandlers): Loader {
  let api: GoogleAccountsId | null = null;
  let ready: Promise<GoogleAccountsId> | null = null;

  function start(): Promise<GoogleAccountsId> {
    ready ??= loadGis().then((loaded) => {
      api = initialise(loaded, clientId, handlers);
      return api;
    });
    return ready;
  }

  return {
    whenReady(use) {
      start()
        .then(use)
        .catch((error: unknown) => {
          handlers.onError(
            error instanceof Error
              ? error.message
              : "Google sign-in is unavailable.",
          );
        });
    },
    current: () => api,
  };
}

/**
 * Identity only. Note what this adapter cannot do: it hands back a decoded
 * profile and nothing else — no token is stored, no capability is issued,
 * and there is no path from here to a signature.
 */
export function createGoogleIdentity(
  clientId: string,
  handlers: IdentityHandlers,
): IdentityPort {
  const loader = createLoader(clientId, handlers);

  return {
    kind: "google",
    attach(container) {
      let live = true;
      loader.whenReady((loaded) => {
        if (live) loaded.renderButton(container, BUTTON);
      });
      return () => {
        live = false;
      };
    },
    signIn() {
      loader.whenReady((loaded) => loaded.prompt());
    },
    signOut() {
      // Per the reference: call this on sign-out, or the next One Tap
      // silently returns the same account and the user cannot get out. If
      // GIS was never loaded there is nothing to auto-select from.
      loader.current()?.disableAutoSelect();
    },
  };
}
