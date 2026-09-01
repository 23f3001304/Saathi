// Orders, which here are payment records and covenant states — not shipments.
//
// Covenant does not fulfil anything, so there is no dispatch, no tracking and
// no "mark as sent". What a shop can see is the money: a cart that was signed,
// a link that was issued, a payment that captured or failed, and the cool-off
// window a buyer is still inside.
import { getJson, isLive } from "./gateway.ts";
import { fixtureOrders } from "./orderFixtures.ts";
import type { OrdersView, OrderView } from "./merchantTypes.ts";

const DEFAULT_LIMIT = 100;

interface RawTxn {
  readonly txn_id: string;
  readonly state: string;
  readonly amount_paise: number;
  readonly currency: string;
  readonly merchant_id: string | null;
  readonly cart_mandate_id: string;
  readonly created_at: string | null;
  readonly cooloff_until: string | null;
}

function orderOf(raw: RawTxn): OrderView {
  return {
    txnId: raw.txn_id,
    state: raw.state,
    amountPaise: raw.amount_paise,
    currency: raw.currency,
    merchantIssuer: raw.merchant_id,
    cartMandateId: raw.cart_mandate_id,
    createdAt: raw.created_at,
    cooloffUntil: raw.cooloff_until,
  };
}

/**
 * `/v1/transactions` serves every merchant on the tenant and names each row's
 * merchant as the cart mandate's issuer URN. The filter is applied here rather
 * than asked for, because the route has no merchant parameter and inventing a
 * client-side one that the server does not enforce would be a filter that
 * looks like an access control. It is not one: these rows are on a ledger any
 * observer may replay.
 */
export async function fetchOrders(issuer: string | null): Promise<OrdersView> {
  if (!isLive()) return { orders: fixtureOrders(issuer), live: false };
  const raw = await getJson<{ items: readonly RawTxn[] }>(
    `/v1/transactions?limit=${DEFAULT_LIMIT.toString()}`,
  );
  const all = raw.items.map(orderOf);
  return {
    orders:
      issuer === null
        ? all
        : all.filter((order) => order.merchantIssuer === issuer),
    live: true,
  };
}
