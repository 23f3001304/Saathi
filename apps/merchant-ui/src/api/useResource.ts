import { useEffect, useState } from "react";

export type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * §4.1 — "~30 lines of useResource<T>; no TanStack." Plain fetch-on-mount;
 * callers pass whatever ledger-derived value should trigger a refetch (a
 * frame count, a `state.folds` version) as an extra dependency.
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // deps is caller-controlled by design (see doc comment above).
  }, [...deps, tick]);

  return { data, loading, error, refetch: () => setTick((t) => t + 1) };
}
