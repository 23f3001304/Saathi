import type { PersistedSession } from "./session.ts";
import type { AuthProfile, AuthSession, Shop } from "./types.ts";

/**
 * signed-out → signed-in → ready.
 *
 * The important edge is the one that is missing. Nothing an identity provider
 * can send moves the machine past `signed-in`; only `shop-chosen` does. And
 * `ready` still authorises nothing: it opens the reads of one shop's folds,
 * which is a different thing from the right to change that shop. That right
 * is asked for separately, and only a signing key answers it.
 */
export const SIGNED_OUT: AuthSession = {
  status: "signed-out",
  profile: null,
  shop: null,
};

export type AuthEvent =
  | { type: "restored"; session: PersistedSession | null }
  | { type: "ring-loaded"; ring: readonly Shop[] }
  | { type: "identified"; profile: AuthProfile }
  | { type: "shop-chosen"; shop: Shop }
  | { type: "shop-cleared" }
  | { type: "signed-out" };

function restore(session: PersistedSession | null): AuthSession {
  if (session === null) return SIGNED_OUT;
  if (session.shop === null) {
    return { status: "signed-in", profile: session.profile, shop: null };
  }
  return { status: "ready", profile: session.profile, shop: session.shop };
}

/**
 * The ring the running gateway pinned at boot arrives after first paint, and
 * it is the authority on which shops exist. A remembered selection that is not
 * in it drops back to the picker rather than quietly leaving a console open
 * for a merchant whose quotes nobody will verify.
 */
function withRing(state: AuthSession, ring: readonly Shop[]): AuthSession {
  if (state.shop === null) return state;
  const live = ring.find((shop) => shop.slug === state.shop?.slug);
  if (live === undefined) return clearShop(state);
  return { ...state, shop: live };
}

function identify(profile: AuthProfile): AuthSession {
  // A fresh identity always lands shop-less. Signing in is an introduction,
  // not a promotion.
  return { status: "signed-in", profile, shop: null };
}

function choose(state: AuthSession, shop: Shop): AuthSession {
  if (state.profile === null) return state;
  return { status: "ready", profile: state.profile, shop };
}

function clearShop(state: AuthSession): AuthSession {
  if (state.profile === null) return SIGNED_OUT;
  return { status: "signed-in", profile: state.profile, shop: null };
}

export function authReducer(state: AuthSession, event: AuthEvent): AuthSession {
  switch (event.type) {
    case "restored":
      return restore(event.session);
    case "ring-loaded":
      return withRing(state, event.ring);
    case "identified":
      return identify(event.profile);
    case "shop-chosen":
      return choose(state, event.shop);
    case "shop-cleared":
      return clearShop(state);
    case "signed-out":
      return SIGNED_OUT;
  }
}
