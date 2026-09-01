import type { PersistedSession } from "./session.ts";
import type { AuthProfile, AuthSession, SigningKeyRecord } from "./types.ts";

/**
 * signed-out → signed-in → key-created → ready.
 *
 * The important edge is the one that is missing. Nothing an identity
 * provider can send moves the machine past `signed-in`; only a
 * `key-created` event, which only the hold-to-sign ceremony emits, does.
 * That is why this is a pure reducer in its own file: the rule is small
 * enough to read in full and to test without a browser.
 */
export const SIGNED_OUT: AuthSession = {
  status: "signed-out",
  profile: null,
  signingKey: null,
};

export type AuthEvent =
  | { type: "restored"; session: PersistedSession | null }
  | { type: "identified"; profile: AuthProfile }
  | { type: "key-created"; key: SigningKeyRecord }
  | { type: "entered" }
  | { type: "signed-out" };

function restore(session: PersistedSession | null): AuthSession {
  if (session === null) return SIGNED_OUT;
  if (session.signingKey === null) {
    return { status: "signed-in", profile: session.profile, signingKey: null };
  }
  return {
    status: "ready",
    profile: session.profile,
    signingKey: session.signingKey,
  };
}

function identify(profile: AuthProfile): AuthSession {
  // A fresh identity always lands key-less. Signing in is an introduction,
  // not a promotion: whatever was here before, this person can buy nothing
  // until the ceremony runs.
  return { status: "signed-in", profile, signingKey: null };
}

function withKey(state: AuthSession, key: SigningKeyRecord): AuthSession {
  // No key without a person to own it — a key created for `null` would be a
  // signing capability with no accountable holder.
  if (state.profile === null) return state;
  return { status: "key-created", profile: state.profile, signingKey: key };
}

function enter(state: AuthSession): AuthSession {
  if (state.signingKey === null) return state;
  return { ...state, status: "ready" };
}

export function authReducer(
  state: AuthSession,
  event: AuthEvent,
): AuthSession {
  switch (event.type) {
    case "restored":
      return restore(event.session);
    case "identified":
      return identify(event.profile);
    case "key-created":
      return withKey(state, event.key);
    case "entered":
      return enter(state);
    case "signed-out":
      return SIGNED_OUT;
  }
}
