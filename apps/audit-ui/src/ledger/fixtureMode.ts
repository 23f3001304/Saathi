// §8 presenter's kit: "a `?seed=demo` query param loads a pre-seeded
// ledger so the empty state is only ever shown on purpose." `dev:fixtures`
// (Vite `--mode fixtures`) forces the same path without the query param.
/** No `window` under the live-transport suite's node environment. */
function param(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function isFixtureMode(): boolean {
  if (import.meta.env.MODE === "fixtures") return true;
  return param("seed") === "demo";
}

export function fixtureScenarioName(): string {
  return param("scenario") ?? "happy-purchase";
}
