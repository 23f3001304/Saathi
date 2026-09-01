// The openers on an empty chat: what the flywheel would suggest, or nothing.
import { isLive } from "./liveMode.ts";
import { getJson } from "./gatewayFetch.ts";

export interface Opener {
  readonly prompt: string;
  readonly why: string;
  /** The bounds the request carries, shown as tags: a budget, a category, a
   *  refund promise. Never invented — either authored with the default or read
   *  off a real recommendation. */
  readonly tags?: readonly string[];
  readonly merchant?: string;
  readonly pricePaise?: number;
}

interface RawRecs {
  items: readonly {
    sku_id: string;
    merchant_id: string | null;
    current_price_paise: number | null;
    reason: string;
  }[];
  k_anonymity: { k: number; suppressed: boolean };
}

/**
 * A sku id is a filing name, not a thing anyone would say out loud. The chip
 * gets the words inside it; the id itself never reaches the screen.
 */
function productWords(skuId: string): string {
  return skuId.replace(/[-_]+/g, " ").trim();
}

/**
 * The openers on an empty chat. A cold ledger has nothing to recommend and
 * k-anonymity suppresses a thin one, so the caller gets an empty list and
 * shows its own defaults — labelled as defaults. A recommendation nobody
 * earned is the one thing this surface must never invent.
 */
export async function fetchOpeners(userId: string): Promise<Opener[]> {
  if (!isLive()) return [];
  const raw = await getJson<RawRecs>(
    `/v1/recs?user_id=${encodeURIComponent(userId)}&limit=3`,
  );
  if (raw.k_anonymity.suppressed) return [];
  return raw.items.map((item) => ({
    prompt: `Buy the ${productWords(item.sku_id)} again`,
    why: item.reason,
    merchant: item.merchant_id ?? undefined,
    pricePaise: item.current_price_paise ?? undefined,
  }));
}
