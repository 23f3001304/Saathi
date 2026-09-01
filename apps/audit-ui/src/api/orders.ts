// `GET /v1/transactions` — every purchase this covenant has run, newest
// first, off the gateway's read model. The list is the order history; the
// per-transaction payment view stays `paymentState.ts`'s question.
import { getJson } from "./gatewayFetch.ts";
import { isLive } from "./liveMode.ts";

export type OrderItem = {
  readonly txnId: string;
  readonly state: string;
  readonly amountPaise: number;
  readonly currency: string;
  readonly merchant: string | null;
  readonly createdAt: string | null;
  readonly cooloffUntil: string | null;
};

interface RawOrder {
  txn_id: string;
  state: string;
  amount_paise: number;
  currency: string;
  merchant_id: string | null;
  created_at: string | null;
  cooloff_until: string | null;
}

/**
 * The gateway's fold words, said the way a shopper would. Anything this map
 * does not know keeps the gateway's own word rather than guessing — a state
 * shown raw is odd; a state shown wrongly is a lie about money.
 */
const STATE_WORDS: Record<string, string> = {
  settled: "Paid",
  captured: "Paid",
  link_issued: "Awaiting payment",
  cooloff_parked: "Cooling off",
  pending_cooloff: "Cooling off",
  proposed: "Awaiting signature",
  authorized: "Awaiting payment",
  pending: "Awaiting payment",
  failed: "Failed",
  refused: "Refused",
  cancelled: "Cancelled",
};

export function stateWord(state: string): string {
  return STATE_WORDS[state] ?? state;
}

/** "urn:covenant:merchant:kolam-run" earns its keep in the Ledger, not here. */
function shortMerchant(id: string | null): string | null {
  if (id === null) return null;
  const tail = id.split(":").pop() ?? id;
  return tail.length > 0 ? tail : id;
}

export async function fetchOrders(): Promise<readonly OrderItem[]> {
  if (!isLive()) return [];
  const raw = await getJson<{ items: RawOrder[] }>("/v1/transactions?limit=50");
  return raw.items.map((row) => ({
    txnId: row.txn_id,
    state: row.state,
    amountPaise: row.amount_paise,
    currency: row.currency,
    // The mandate's issuer is a URN; the row title is for a person.
    merchant: shortMerchant(row.merchant_id),
    createdAt: row.created_at,
    cooloffUntil: row.cooloff_until,
  }));
}
