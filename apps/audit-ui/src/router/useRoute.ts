import { useCallback, useSyncExternalStore } from "react";

export type Route =
  | { name: "bench" }
  | { name: "covenant" }
  | { name: "ledger" }
  | { name: "orders" }
  | { name: "ledger-sku"; sku: string }
  | { name: "settings" };

function parse(pathname: string): Route {
  const skuMatch = /^\/ledger\/sku\/([^/]+)$/.exec(pathname);
  if (skuMatch?.[1] !== undefined)
    return { name: "ledger-sku", sku: decodeURIComponent(skuMatch[1]) };
  if (pathname === "/covenant") return { name: "covenant" };
  if (pathname === "/settings") return { name: "settings" };
  if (pathname === "/ledger") return { name: "ledger" };
  if (pathname === "/orders") return { name: "orders" };
  return { name: "bench" };
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

// `useSyncExternalStore` requires a stable snapshot reference when nothing
// changed; `parse()` builds a fresh object every call, so cache it against
// the one pathname it's actually a function of (module-scoped: pathname is
// a single global value regardless of how many components call this hook).
let cachedPathname: string | null = null;
let cachedRoute: Route | null = null;

function getSnapshot(): Route {
  const pathname = window.location.pathname;
  if (cachedRoute === null || cachedPathname !== pathname) {
    cachedPathname = pathname;
    cachedRoute = parse(pathname);
  }
  return cachedRoute;
}

const ROUTE_PATH: Record<Route["name"], string> = {
  bench: "/",
  covenant: "/covenant",
  ledger: "/ledger",
  orders: "/orders",
  settings: "/settings",
  "ledger-sku": "/ledger/sku",
};

/** §1.3 — a ~40-line hand-rolled router; no react-router (§0). */
export function useRoute(): { route: Route; navigate: (route: Route) => void } {
  const route = useSyncExternalStore(subscribe, getSnapshot);

  const navigate = useCallback((next: Route) => {
    const path =
      next.name === "ledger-sku"
        ? `/ledger/sku/${encodeURIComponent(next.sku)}`
        : ROUTE_PATH[next.name];
    if (path !== window.location.pathname) {
      window.history.pushState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, []);

  return { route, navigate };
}
