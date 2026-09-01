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
import type {
  AuthSession,
  IdentityFactory,
  IdentityKind,
  Shop,
} from "./types.ts";

export type AuthContextValue = AuthSession & {
  identityKind: IdentityKind;
  error: string | null;
  /** Shops in the pinned ring; empty until the gateway has answered. */
  ring: readonly Shop[];
  ringLoaded: boolean;
  /** Ref callback: hands the provider's own button a container to draw in. */
  attachRef: (element: HTMLElement | null) => void;
  signIn: () => void;
  chooseShop: (shop: Shop) => void;
  leaveShop: () => void;
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
 * render too late: a returning shopkeeper would see the doorstep flash past on
 * the way to their briefing and — worse — the sign-in screen would mount and
 * reach for Google's script on behalf of someone already signed in.
 */
function restoreSession(): AuthSession {
  return authReducer(SIGNED_OUT, {
    type: "restored",
    session: readStoredSession(),
  });
}

export function AuthProvider({
  children,
  ring,
  ringLoaded,
  identityFactory = createIdentity,
}: {
  children: ReactNode;
  ring: readonly Shop[];
  ringLoaded: boolean;
  identityFactory?: IdentityFactory;
}): JSX.Element {
  const [session, dispatch] = useReducer(
    authReducer,
    undefined,
    restoreSession,
  );
  const [error, setError] = useState<string | null>(null);

  const port = useMemo(
    () =>
      identityFactory({
        onIdentity: (profile) => dispatch({ type: "identified", profile }),
        onError: setError,
      }),
    [identityFactory],
  );

  useEffect(() => {
    if (ringLoaded) dispatch({ type: "ring-loaded", ring });
  }, [ring, ringLoaded]);

  useEffect(() => {
    if (session.profile === null) return;
    writeStoredSession({ profile: session.profile, shop: session.shop });
  }, [session]);

  const signOut = useCallback(() => {
    port.signOut();
    clearStoredSession();
    setError(null);
    dispatch({ type: "signed-out" });
  }, [port]);

  const attachRef = useIdentityAttach(
    useCallback((element: HTMLElement) => port.attach(element), [port]),
  );

  const value: AuthContextValue = {
    ...session,
    identityKind: port.kind,
    error,
    ring,
    ringLoaded,
    attachRef,
    signIn: useCallback(() => port.signIn(), [port]),
    chooseShop: useCallback((shop: Shop) => {
      dispatch({ type: "shop-chosen", shop });
    }, []),
    leaveShop: useCallback(() => dispatch({ type: "shop-cleared" }), []),
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
