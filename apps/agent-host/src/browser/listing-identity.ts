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

/** Words that name a thing FOR a product rather than the product: the tile
 *  "ZORBES SSD Case Compatible with Crucial X9" carries every token an SSD
 *  search wants and is a pouch. Word overlap cannot see category; this can. */
const ACCESSORY_WORDS =
  /\b(case|cover|pouch|sleeve|enclosure|adapter|cable|charger|protector|skin|bag|mount|stand|holder|caddy|tray|strap|film|guard)\b/i;

/**
 * Whether a listing is an accessory to the thing asked for rather than the
 * thing. An accessory word in the title that the query never said is the
 * signal; "compatible with" seals it. A shopper who asked for the case gets
 * the case: their own word in the query clears it.
 */
export function accessoryFor(title: string, query: string): boolean {
  const word = ACCESSORY_WORDS.exec(title)?.[1];
  const compatible = /compatible (with|for)/i.test(title);
  if (word === undefined && !compatible) return false;
  if (word !== undefined && new RegExp(`\b${word}\b`, "i").test(query)) {
    return false;
  }
  return word !== undefined || compatible;
}

/**
 * Storage capacity as a number of gigabytes, read off a title or a query.
 * A unit parser, not a word-list: "2TB", "2 TB", "2048GB" agree with each
 * other; "512GB" does not agree with any of them.
 */
function gigabytesIn(text: string): readonly number[] {
  const found: number[] = [];
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(tb|gb)\b/gi)) {
    const size = Number(match[1]);
    if (!Number.isFinite(size) || size <= 0) continue;
    found.push(match[2]?.toLowerCase() === "tb" ? size * 1000 : size);
  }
  return found;
}

/**
 * Whether a listing states a capacity that contradicts the one asked for.
 * Word overlap cannot compare quantities: a 512GB title carrying "NVMe M.2
 * internal SSD" outscored its own wrong number against a 2TB ask. A query
 * with no capacity constrains nothing; a title stating none is kept, since
 * absence is not a contradiction.
 */
export function capacityMismatch(title: string, query: string): boolean {
  const wanted = gigabytesIn(query);
  if (wanted.length === 0) return false;
  const stated = gigabytesIn(title);
  if (stated.length === 0) return false;
  // 1024-vs-1000 conventions land within a tenth of each other.
  return !stated.some((size) =>
    wanted.some((want) => size >= want * 0.9 && size <= want * 1.1),
  );
}
