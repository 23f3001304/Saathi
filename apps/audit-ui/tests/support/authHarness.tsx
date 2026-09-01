// Shared rigging for the sign-in suites: the fixtures, a stand-in for GIS,
// and the two browser gaps jsdom leaves (pointer capture, reduced motion).
import { render, type RenderResult } from "@testing-library/react";
import type { JSX, ReactNode } from "react";
import { vi } from "vitest";
import { AuthProvider, useAuth } from "../../src/auth/AuthProvider.tsx";
import { canSign } from "../../src/auth/authority.ts";
import { resetGisForTests } from "../../src/auth/gis.ts";
import type {
  AuthProfile,
  IdentityFactory,
  IdentityHandlers,
  IdentityPort,
  SigningKeyRecord,
} from "../../src/auth/types.ts";
import { SignIn } from "../../src/screens/SignIn.tsx";
import { SignInKey } from "../../src/screens/SignInKey.tsx";
import { installMemoryStorage } from "./memoryStorage.ts";

export const GOOGLE: AuthProfile = {
  kind: "google",
  subject: "104729384756102938475",
  name: "Mehang",
  email: "mehang@example.com",
  pictureUrl: null,
};

export const KEY: SigningKeyRecord = {
  thumbprint: "9f2c4d1a77b03e58",
  algorithm: "ES256",
  createdAt: "2026-08-31T09:00:00.000Z",
};

export const GIS_SELECTOR = 'script[src^="https://accounts.google.com/gsi/client"]';
export const CLIENT_ID = "test-client.apps.googleusercontent.com";
export const STORAGE_KEY = "covenant-auth";

/** A stand-in for GIS that hands back a real-shaped Google profile. */
export function googleFactory(handlers: IdentityHandlers): IdentityPort {
  return {
    kind: "google",
    attach: () => () => undefined,
    signIn: () => handlers.onIdentity(GOOGLE),
    signOut: () => undefined,
  };
}

/** The route gate, in miniature: exactly the shape App.tsx uses. */
export function Flow(): JSX.Element {
  const { status } = useAuth();
  if (status === "signed-out") return <SignIn />;
  if (status === "ready") return <p>Chat</p>;
  return <SignInKey />;
}

/** Exposes the parts of the hook a screen would not otherwise reach. */
export function Probe(): JSX.Element {
  const auth = useAuth();
  return (
    <div>
      <button type="button" onClick={auth.signIn}>
        trigger sign-in
      </button>
      <span data-testid="authority">
        {canSign(auth) ? "can-sign" : "cannot-sign"}
      </span>
    </div>
  );
}

/** jsdom implements neither pointer capture nor a reduced-motion query. */
export function stubBrowserGaps(): void {
  Element.prototype.setPointerCapture = () => undefined;
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

/** A developer's local .env must not decide what these tests exercise. */
export function resetAuthEnvironment(): void {
  vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
  installMemoryStorage();
  resetGisForTests();
  document.querySelectorAll(GIS_SELECTOR).forEach((el) => el.remove());
}

/** A returning visitor: identity and key already on disk. */
export function seedStoredSession(): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ profile: GOOGLE, signingKey: KEY }),
  );
}

export function mount(
  ui: ReactNode,
  identityFactory?: IdentityFactory,
): RenderResult {
  return render(
    <AuthProvider identityFactory={identityFactory}>{ui}</AuthProvider>,
  );
}
