// The parts of sign-in that touch the outside world: an ID token we decode
// but never trust, a localStorage that is allowed to refuse us, and the
// ceremony that makes the one thing here with real authority.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  installMemoryStorage,
  withHostileStorage,
} from "./support/memoryStorage.ts";
import { decodeProfileForDisplay } from "../src/auth/decodeIdToken.ts";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "../src/auth/session.ts";
import { createSigningKey } from "../src/auth/signingKey.ts";
import type { AuthProfile, SigningKeyRecord } from "../src/auth/types.ts";

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

function jwt(claims: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  const payload = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJSUzI1NiJ9.${payload}.not-a-real-signature`;
}

describe("the ID token is decoded for display and trusted for nothing", () => {
  it("reads the claims a name needs, UTF-8 and all", () => {
    const profile = decodeProfileForDisplay(
      jwt({ sub: "1029", name: "मेहंग", email: "m@example.com", picture: "u" }),
    );
    expect(profile?.name).toBe("मेहंग");
    expect(profile?.subject).toBe("1029");
    expect(profile?.kind).toBe("google");
  });

  it("falls back to the address when Google sends no name", () => {
    const profile = decodeProfileForDisplay(jwt({ sub: "1", email: "a@b.c" }));
    expect(profile?.name).toBe("a@b.c");
    expect(profile?.pictureUrl).toBeNull();
  });

  it("signs nobody in on a malformed or subject-less credential", () => {
    expect(decodeProfileForDisplay("not-a-jwt")).toBeNull();
    expect(decodeProfileForDisplay("a.!!!!.c")).toBeNull();
    expect(decodeProfileForDisplay(jwt({ name: "No subject" }))).toBeNull();
  });
});

describe("session storage is a convenience, never a dependency", () => {
  beforeEach(installMemoryStorage);

  it("round-trips a session and clears it again", () => {
    writeStoredSession({ profile: GOOGLE, signingKey: KEY });
    expect(readStoredSession()).toEqual({ profile: GOOGLE, signingKey: KEY });
    clearStoredSession();
    expect(readStoredSession()).toBeNull();
  });

  it("treats a private window, where the access itself throws, as nobody", () => {
    withHostileStorage(() => {
      expect(readStoredSession()).toBeNull();
      expect(() => writeStoredSession({ profile: GOOGLE, signingKey: KEY })).not.toThrow();
      expect(() => clearStoredSession()).not.toThrow();
    });
  });

  it("survives a refused write and a refused clear", () => {
    const write = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    const remove = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });
    expect(() => writeStoredSession({ profile: GOOGLE, signingKey: KEY })).not.toThrow();
    expect(() => clearStoredSession()).not.toThrow();
    write.mockRestore();
    remove.mockRestore();
  });

});

describe("what is written, and what is deliberately not", () => {
  beforeEach(installMemoryStorage);

  it("ignores a corrupt or half-written value rather than trusting it", () => {
    window.localStorage.setItem("covenant-auth", "{not json");
    expect(readStoredSession()).toBeNull();
    window.localStorage.setItem("covenant-auth", JSON.stringify({ profile: {} }));
    expect(readStoredSession()).toBeNull();
    clearStoredSession();
  });

  it("never writes the ID token to disk", () => {
    writeStoredSession({ profile: GOOGLE, signingKey: KEY });
    const raw = window.localStorage.getItem("covenant-auth") ?? "";
    expect(raw).not.toContain("credential");
    expect(raw).not.toContain("eyJ");
    clearStoredSession();
  });
});

describe("the key ceremony makes a real key", () => {
  it("produces an ES256 record with a distinct thumbprint each time", async () => {
    const first = await createSigningKey();
    const second = await createSigningKey();
    expect(first.algorithm).toBe("ES256");
    expect(first.thumbprint).toMatch(/^[0-9a-f]{16}$/);
    expect(first.thumbprint).not.toBe(second.thumbprint);
  });
});
