/**
 * What a scraped tile is actually about, and which tiles are the same thing.
 *
 * A shop's product title is not a product name. It is a name plus whatever the
 * page was decorating it with: "Deal Price ₹619", "M.R.P.: ₹1,299", "58% off",
 * "Limited time deal". Two live faults came out of taking that string at face
 * value. Dresses and a smartwatch were carded against an SSD search, because
 * the junk in their titles overlapped the commerce-flavoured words in the
 * query. And one Crucial drive was carded twice — once off the search results,
 * once off its own product page — because the two titles decorated the same
 * name differently and the identity was the whole string.
 */

/** Prices, discounts and the words shops wrap around them. Order matters:
 *  figures go before the words that introduce them. */
const NOISE: readonly RegExp[] = [
  /(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?/giu,
  /\b\d+(?:\.\d+)?\s*%\s*(?:off|discount)\b/giu,
  /\bm\.?r\.?p\.?:?/giu,
  /\b(?:deal|sale|offer|special|limited\s+time|today\s+only|save|extra|upto|up\s+to|starting|from|only|free\s+delivery|inclusive\s+of\s+all\s+taxes)\b/giu,
  /\b(?:price|prices|discount|off|deal\s+price|bestseller|sponsored)\b/giu,
];

/**
 * The title with the shop's decoration taken off.
 *
 * Deliberately conservative: it removes money, percentages and a short list of
 * merchandising words, and touches nothing else. A model number that looks
 * like a price does not exist; a product genuinely called "Save" would lose a
 * word, and would still carry the rest of its name.
 */
export function cleanTitle(title: string): string {
  const stripped = NOISE.reduce(
    (text, pattern) => text.replace(pattern, " "),
    title,
  );
  return stripped.replace(/\s+/gu, " ").trim();
}

/**
 * The shop's own id for a product, taken out of its URL.
 *
 * Every large shop puts one there — Amazon's `/dp/B0CK778YL5`, and the same
 * shape under `/gp/product/` — and it is the only identity in a listing that
 * the page cannot decorate. Where there is none, `null`: the caller falls back
 * to the name, which is what it had before.
 */
export function productKey(url: string): string | null {
  const found = /\/(?:dp|gp\/product|product|itm|p)\/([A-Za-z0-9]{6,})/u.exec(
    url,
  );
  return found?.[1]?.toUpperCase() ?? null;
}

/** One product, however many pages showed it. */
export function identityOf(listing: {
  readonly title: string;
  readonly url: string;
  readonly price_paise: number | null;
  readonly price_text: string;
}): string {
  const keyed = productKey(listing.url);
  if (keyed !== null) return `id:${keyed}`;
  const name = cleanTitle(listing.title).toLowerCase();
  return `${name}|${listing.price_paise ?? listing.price_text}`;
}
