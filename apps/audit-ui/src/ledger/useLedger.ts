import { useRef, useSyncExternalStore } from "react";
import { useLedgerStore } from "./LedgerProvider.tsx";
import type { LedgerState } from "./reducer.ts";

type Cache<T> = { state: LedgerState; value: T };

/**
 * A selector-scoped subscription: components re-render only when their own
 * slice changes (§4.1's whole point — chat tokens never touch the kolam).
 * Caches by `state` identity so a selector that derives a fresh array/object
 * doesn't trip `useSyncExternalStore`'s "getSnapshot should be cached" rule.
 */
export function useLedgerSelector<T>(selector: (state: LedgerState) => T): T {
  const store = useLedgerStore();
  const cache = useRef<Cache<T> | null>(null);

  function getSnapshot(): T {
    const state = store.getState();
    if (cache.current !== null && cache.current.state === state)
      return cache.current.value;
    const value = selector(state);
    cache.current = { state, value };
    return value;
  }

  return useSyncExternalStore(store.subscribe, getSnapshot);
}

export function useLedgerState(): LedgerState {
  return useLedgerSelector((state) => state);
}
