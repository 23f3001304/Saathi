import type { MerchantItem } from "@covenant/domain";

import type { CatalogSku } from "./demo-catalog.js";

/**
 * Razorpay Items models availability (`active`), never a quantity. Rather than
 * invent a count, an active item admits any quantity here and the last-unit
 * race is settled where it always was: the gateway's stock reservations, which
 * answer `STOCK_CONFLICT` and are the only party that can hold a unit.
 */
export const AVAILABLE_UNCOUNTED = Number.MAX_SAFE_INTEGER;

/**
 * Razorpay Items has no category field, so a live listing declares none — and
 * `""` is not a way to say that. The cart line's category is a required
 * non-empty string (§A.2), so an empty one makes the whole Cart Mandate
 * unreadable and the gateway answers `MANDATE_MALFORMED` before it has read a
 * single bound. This names the absence instead of guessing at what is absent:
 * it is a harness constant, identical on every live row, so it steers no search
 * and asserts nothing about the goods.
 */
export const UNCATEGORISED = "uncategorised";

/**
 * The merchant's own photograph, on a labelled line of the item description —
 * the only place Razorpay's item schema leaves for one. https only: the URL is
 * fetched by a shopper's browser without being asked, so `http:` would be
 * blocked as mixed content and `javascript:`/`data:` have no business here.
 */
const IMAGE_LINE = /^Product image:\s*(\S+)\s*$/im;

function imageUrlOf(description: string): string | null {
  const found = IMAGE_LINE.exec(description)?.[1];
  if (found === undefined) {
    return null;
  }
  try {
    const url = new URL(found);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A live item read as a shelf row.
 *
 * Three of `CatalogSku`'s fields have no counterpart on the item entity, and
 * each is filled with the reading that costs the buyer nothing if it is wrong:
 *
 * - `category` is `UNCATEGORISED`, per its note above. Deriving one from the
 *   description would put merchant prose back into what the search matches on
 *   — the injection this catalog is built to refuse.
 * - `refundable` is false. The entity carries no returns policy, and a
 *   refundability claim is checked against the covenant later, so inventing
 *   one here would manufacture a promise the merchant never made.
 * - `stock` follows `active`, per `AVAILABLE_UNCOUNTED` above.
 *
 * `floorPricePaise` was the fourth and is no longer a guess: `floorPaise` is
 * the band the merchant signed, carried on the shelf row beside the price it
 * bounds. Absent one it falls back to the listed amount — which is not an
 * inferred floor but the absence of any discount authority, so `QuoteTool`
 * signs at list and never below, exactly as before this existed.
 *
 * The amount itself is a **claim**, not a price: it reaches the buyer as a P0
 * listing and becomes money only once the merchant signs a quote for it.
 */
export function skuOfItem(
  item: MerchantItem,
  floorPaise: number | null = null,
): CatalogSku {
  return {
    sku: item.itemId,
    label: item.name,
    category: UNCATEGORISED,
    listPricePaise: item.price.paise,
    currency: item.price.currency,
    floorPricePaise: floorPaise ?? item.price.paise,
    refundable: false,
    stock: item.active ? AVAILABLE_UNCOUNTED : 0,
    description: item.description,
    imageUrl: imageUrlOf(item.description),
  };
}
