import { fetchMerchantDesk, fetchShelf } from "../src/api/merchantApi.ts";
import {
  fetchDemand,
  fetchLeakage,
  fetchListingAudit,
  fetchNegotiated,
} from "../src/api/merchantInsightApi.ts";
import { fetchOrders } from "../src/api/ordersApi.ts";
import type { Resource } from "../src/api/useResource.ts";
import type { TurnContext } from "../src/assistant/turn.ts";

function resource<T>(data: T): Resource<T> {
  return { data, loading: false, error: null, refetch: () => undefined };
}

/** The reads a turn runs against, off the fixtures, with nothing pending. */
export async function shopContext(): Promise<TurnContext> {
  const desk = await fetchMerchantDesk("kolam-run");
  return {
    shopSlug: "kolam-run",
    now: new Date("2026-08-31T13:20:00.000Z"),
    pending: null,
    data: {
      desk: resource(desk),
      shelf: resource(await fetchShelf()),
      audit: resource(await fetchListingAudit()),
      demand: resource(await fetchDemand("kolam-run")),
      leakage: resource(await fetchLeakage("kolam-run")),
      negotiated: resource(await fetchNegotiated("kolam-run")),
      orders: resource(await fetchOrders("urn:covenant:merchant:kolam-run")),
      standing: desk.merchants[0] ?? null,
      live: true,
    },
  };
}
