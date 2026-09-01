import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { authReducer, SIGNED_OUT } from "./authMachine.ts";
import { createIdentity } from "./createIdentity.ts";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./session.ts";
import { createSigningKey } from "./signingKey.ts";
import type { AuthSession, IdentityFactory, IdentityKind } from "./types.ts";

export type AuthContextValue = AuthSession & {
  identityKind: IdentityKind;
  error: string | null;
  creatingKey: boolean;
  /** Ref callback: hands the provider's own button a container to draw in. */
  attachRef: (element: HTMLElement | null) => void;
  signIn: () => void;
  /** The ceremony's payload. Nothing else in the app may call this. */
  createKey: () => void;
  enter: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function useIdentityAttach(
  attach: (element: HTMLElement) => () => void,
): (element: HTMLElement | null) => void {
  const detach = useRef<(() => void) | null>(null);
  return useCallback(
    (element: HTMLElement | null) => {
      detach.current?.();
      detach.current = element === null ? null : attach(element);
    },
    [attach],
  );
}

/**
 * Restored synchronously, before the first paint. An effect would be one
 * render too late: a returning visitor would see the doorstep flash past on
 * the way to Chat, and — worse — the sign-in screen would mount and reach
 * for Google's script on behalf of someone already signed in.
 */
function restoreSession(): AuthSession {
  return authReducer(SIGNED_OUT, {
    type: "restored",
    session: readStoredSession(),
  });
}

export function AuthProvider({
  children,
  identityFactory = createIdentity,
}: {
  children: ReactNode;
  identityFactory?: IdentityFactory;
}): JSX.Element {
  const [session, dispatch] = useReducer(authReducer, undefined, restoreSession);
  const [error, setError] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState(false);

  const port = useMemo(
    () =>
      identityFactory({
        onIdentity: (profile) => dispatch({ type: "identified", profile }),
        onError: setError,
      }),
    [identityFactory],
  );

  useEffect(() => {
    if (session.profile === null) return;
    writeStoredSession({
      profile: session.profile,
      signingKey: session.signingKey,
    });
  }, [session]);

  const createKey = useCallback(() => {
    setCreatingKey(true);
    createSigningKey()
      .then((key) => dispatch({ type: "key-created", key }))
      .catch(() => setError("I could not make a signing key in this browser."))
      .finally(() => setCreatingKey(false));
  }, []);

  const signOut = useCallback(() => {
    port.signOut();
    clearStoredSession();
    setError(null);
    dispatch({ type: "signed-out" });
  }, [port]);

  const attachRef = useIdentityAttach(
    useCallback((element: HTMLElement) => port.attach(element), [port]),
  );
  const signIn = useCallback(() => port.signIn(), [port]);
  const enter = useCallback(() => dispatch({ type: "entered" }), []);

  const value: AuthContextValue = {
    ...session,
    identityKind: port.kind,
    error,
    creatingKey,
    attachRef,
    signIn,
    createKey,
    enter,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error("useAuth() needs an <AuthProvider> above it");
  }
  return value;
}
