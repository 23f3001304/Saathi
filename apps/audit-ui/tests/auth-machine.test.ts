// The state machine and the one rule the whole feature exists to hold:
// signing in identifies a person, and identifying a person authorises
// nothing. Pure reducer, no browser.
import { describe, expect, it } from "vitest";
import { authReducer, SIGNED_OUT, type AuthEvent } from "../src/auth/authMachine.ts";
import { authorityNote, canSign } from "../src/auth/authority.ts";
import type { AuthProfile, AuthSession, SigningKeyRecord } from "../src/auth/types.ts";

const GOOGLE: AuthProfile = {
  kind: "google",
  subject: "104729384756102938475",
  name: "Mehang",
  email: "mehang@example.com",
  pictureUrl: "https://lh3.googleusercontent.com/a/x",
};

const KEY: SigningKeyRecord = {
  thumbprint: "9f2c4d1a77b03e58",
  algorithm: "ES256",
  createdAt: "2026-08-31T09:00:00.000Z",
};

function run(events: AuthEvent[]): AuthSession {
  return events.reduce(authReducer, SIGNED_OUT);
}

describe("the auth state machine walks signed-out → signed-in → key-created → ready", () => {
  it("starts with nobody here", () => {
    expect(SIGNED_OUT.status).toBe("signed-out");
    expect(SIGNED_OUT.profile).toBeNull();
    expect(SIGNED_OUT.signingKey).toBeNull();
  });

  it("takes each step in order, and no step out of order", () => {
    const identified = run([{ type: "identified", profile: GOOGLE }]);
    expect(identified.status).toBe("signed-in");
    const keyed = authReducer(identified, { type: "key-created", key: KEY });
    expect(keyed.status).toBe("key-created");
    expect(authReducer(keyed, { type: "entered" }).status).toBe("ready");
  });

  it("keeps the person's name across the ceremony", () => {
    const ready = run([
      { type: "identified", profile: GOOGLE },
      { type: "key-created", key: KEY },
      { type: "entered" },
    ]);
    expect(ready.profile).toEqual(GOOGLE);
    expect(ready.signingKey).toEqual(KEY);
  });
});

describe("the machine refuses the shortcuts", () => {
  it("will not enter the app on an identity alone", () => {
    const identified = run([{ type: "identified", profile: GOOGLE }]);
    expect(authReducer(identified, { type: "entered" })).toEqual(identified);
    expect(authReducer(identified, { type: "entered" }).status).toBe("signed-in");
  });

  it("will not mint a key for nobody", () => {
    expect(authReducer(SIGNED_OUT, { type: "key-created", key: KEY })).toEqual(
      SIGNED_OUT,
    );
  });

  it("drops the key when the person signs out", () => {
    const ready = run([
      { type: "identified", profile: GOOGLE },
      { type: "key-created", key: KEY },
      { type: "entered" },
    ]);
    expect(authReducer(ready, { type: "signed-out" })).toEqual(SIGNED_OUT);
  });

  it("re-identifying always lands key-less, never back in the app", () => {
    const ready = run([
      { type: "identified", profile: GOOGLE },
      { type: "key-created", key: KEY },
      { type: "entered" },
    ]);
    const again = authReducer(ready, { type: "identified", profile: GOOGLE });
    expect(again.status).toBe("signed-in");
    expect(again.signingKey).toBeNull();
  });
});

describe("a restored session resumes at the right step", () => {
  it("restores an identity with a key straight into the app", () => {
    const state = run([
      { type: "restored", session: { profile: GOOGLE, signingKey: KEY } },
    ]);
    expect(state.status).toBe("ready");
  });

  it("restores an identity without a key back into the ceremony", () => {
    const state = run([
      { type: "restored", session: { profile: GOOGLE, signingKey: null } },
    ]);
    expect(state.status).toBe("signed-in");
  });

  it("restores nothing as nobody", () => {
    expect(run([{ type: "restored", session: null }])).toEqual(SIGNED_OUT);
  });
});

describe("Google identifies you; it does not authorise purchases", () => {
  it("gives a complete, genuine Google profile no purchase authority at all", () => {
    const signedIn = run([{ type: "identified", profile: GOOGLE }]);
    expect(signedIn.profile).toEqual(GOOGLE);
    expect(canSign(signedIn)).toBe(false);
  });

  it("cannot be talked into authority by identity events alone", () => {
    const hammered = run([
      { type: "identified", profile: GOOGLE },
      { type: "entered" },
      { type: "identified", profile: GOOGLE },
      { type: "entered" },
    ]);
    expect(hammered.signingKey).toBeNull();
    expect(canSign(hammered)).toBe(false);
    expect(hammered.status).not.toBe("ready");
  });

  it("grants authority only once the key ceremony has run", () => {
    const keyed = run([
      { type: "identified", profile: GOOGLE },
      { type: "key-created", key: KEY },
    ]);
    expect(canSign(keyed)).toBe(true);
    expect(authorityNote(keyed)).toContain(KEY.thumbprint);
  });

  it("says so out loud while there is no key", () => {
    const signedIn = run([{ type: "identified", profile: GOOGLE }]);
    expect(authorityNote(signedIn)).toContain("no signing key");
  });
});

