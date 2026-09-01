import { useCallback, useSyncExternalStore } from "react";

/**
 * The conversation is home, exactly as it is for the shopper. The pages stay —
 * a shopkeeper who wants to sit and read their orders should be able to open
 * Orders, and back and forward must work — but they are somewhere you go, not
 * the thing you land in.
 */
export type PageName =
  | "chat"
  | "listings"
  | "orders"
  | "standing"
  | "briefing"
  | "demand"
  | "leakage"
  | "settings";

export type Route = { name: PageName } | { name: "listing"; itemId: string };

const PATH_OF: Record<PageName, string> = {
  chat: "/",
  listings: "/listings",
  orders: "/orders",
  standing: "/standing",
  briefing: "/briefing",
  demand: "/demand",
  leakage: "/leakage",
  settings: "/settings",
};

const NAME_OF: Record<string, PageName> = Object.fromEntries(
  Object.entries(PATH_OF).map(([name, path]) => [path, name as PageName]),
);

function parse(pathname: string): Route {
  const listing = /^\/listings\/([^/]+)$/.exec(pathname);
  if (listing?.[1] !== undefined) {
    return { name: "listing", itemId: decodeURIComponent(listing[1]) };
  }
  const name = NAME_OF[pathname];
  return { name: name ?? "chat" };
}

export function pathOf(route: Route): string {
  return route.name === "listing"
    ? `/listings/${encodeURIComponent(route.itemId)}`
    : PATH_OF[route.name];
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

// `useSyncExternalStore` requires a stable snapshot reference when nothing
// changed; `parse()` builds a fresh object every call, so cache it against the
// one pathname it is actually a function of.
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

export function useRoute(): { route: Route; navigate: (route: Route) => void } {
  const route = useSyncExternalStore(subscribe, getSnapshot);

  const navigate = useCallback((next: Route) => {
    const path = pathOf(next);
    if (path !== window.location.pathname) {
      window.history.pushState(null, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, []);

  return { route, navigate };
}
