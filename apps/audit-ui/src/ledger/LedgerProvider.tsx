// §4.1 — "Exposed through LedgerProvider (context) + useSyncExternalStore
// selectors so a chat token stream never re-renders the kolam." The
// provider owns exactly one transport connection for the app's lifetime.
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type JSX,
} from "react";
import {
  ledgerReducer,
  initialLedgerState,
  type LedgerState,
  type LedgerAction,
} from "./reducer.ts";
import {
  connectLedgerTransport,
  type LedgerTransport,
  type LedgerTransportHandlers,
} from "./transport.ts";
import { connectFixtureTransport } from "./fixtureTransport.ts";
import { fixtureScenarioName } from "./fixtureMode.ts";
import { gatewayBaseUrl } from "../api/liveMode.ts";
import { scenarioFrames } from "./fixtures/index.ts";

export type LedgerStore = {
  getState: () => LedgerState;
  subscribe: (listener: () => void) => () => void;
  dispatch: (action: LedgerAction) => void;
};

function createLedgerStore(): LedgerStore {
  let state = initialLedgerState;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch: (action) => {
      state = ledgerReducer(state, action);
      listeners.forEach((listener) => listener());
    },
  };
}

const LedgerStoreContext = createContext<LedgerStore | null>(null);

function frameHandlers(store: LedgerStore): LedgerTransportHandlers {
  return {
    onFrame: (frame) => store.dispatch({ type: "frame", frame }),
    onModeChange: (mode) => store.dispatch({ type: "connection", mode }),
  };
}

function playFixtures(store: LedgerStore): LedgerTransport {
  store.dispatch({ type: "source", source: "fixtures" });
  return connectFixtureTransport(
    scenarioFrames(fixtureScenarioName()),
    frameHandlers(store),
  );
}

/**
 * The gateway is gone. Rather than leave the kolam empty — indistinguishable
 * from "nothing has happened yet" — the reel stands in, `source` says it is a
 * reel, and `connectionMode` stays `offline` so nothing on screen claims the
 * frames were verified. Falling back silently would be the lie; falling back
 * loudly is the honest degradation §4.4 asks for.
 */
function fallbackToFixtures(store: LedgerStore): LedgerTransport {
  store.dispatch({ type: "source", source: "fixtures" });
  return connectFixtureTransport(scenarioFrames(fixtureScenarioName()), {
    onFrame: (frame) => store.dispatch({ type: "frame", frame }),
    onModeChange: () => undefined,
  });
}

function connect(store: LedgerStore): LedgerTransport {
  const base = gatewayBaseUrl();
  if (base === null) return playFixtures(store);
  store.dispatch({ type: "source", source: "live" });
  let standIn: LedgerTransport | null = null;
  const live = connectLedgerTransport(base, {
    ...frameHandlers(store),
    onUnreachable: () => {
      standIn ??= fallbackToFixtures(store);
    },
  });
  return {
    close: () => {
      live.close();
      standIn?.close();
    },
  };
}

export function LedgerProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const storeRef = useRef<LedgerStore | null>(null);
  storeRef.current ??= createLedgerStore();
  const store = storeRef.current;

  useEffect(() => {
    const transport = connect(store);
    return () => transport.close();
  }, [store]);

  return (
    <LedgerStoreContext.Provider value={store}>
      {children}
    </LedgerStoreContext.Provider>
  );
}

export function useLedgerStore(): LedgerStore {
  const store = useContext(LedgerStoreContext);
  if (store === null)
    throw new Error("useLedgerStore must be used within a LedgerProvider");
  return store;
}

/** `null` outside a provider — for chrome that must render either way. */
export function useOptionalLedgerStore(): LedgerStore | null {
  return useContext(LedgerStoreContext);
}
