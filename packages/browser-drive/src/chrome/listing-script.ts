import type { PageListing } from "../read/page-dom.js";

/**
 * Runs *inside the page*, like `read-script.ts`: puppeteer stringifies it, so
 * every helper is inline and nothing is imported at runtime.
 *
 * DECISION: only what the **web** standardises about a product —
 * `schema.org/Product` as JSON-LD, the same vocabulary as microdata, and
 * OpenGraph. No selector here names a storefront: a reader tuned to one shop's
 * class names works on one shop, and the claim this path makes is "the open
 * web". A page that declares nothing yields nothing here, and `tile-script.ts`
 * takes the next turn.
 *
 * DECISION: a second `evaluate`, beside the one `readPageDom` keeps atomic.
 * That snapshot must be atomic because its selectors are *aimed at*. Nothing is
 * ever aimed at a listing: it is read, and a pick navigates to its URL — one
 * tick stale is a stale price, and a stale price is what a page price is.
 */
// eslint-disable-next-line max-lines-per-function
export function readDeclaredListings(): readonly PageListing[] {
  const MAX_LISTINGS = 12;
  const MAX_TEXT = 300;
  /** Pairs, not a map, so the table costs one line: the code a shop declares,
   *  then the mark a person reads. An unlisted code is printed as it came. */
  const MARKS = ["INR", "₹", "USD", "$", "EUR", "€", "GBP", "£"];
  type Node = Record<string, unknown>;
  const clean = (value: string | null | undefined): string =>
    (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  const query = (selector: string): Element[] =>
    Array.from(document.querySelectorAll(selector));
  const absolute = (raw: string): string => {
    try {
      return new URL(raw, location.href).toString();
    } catch {
      return "";
    }
  };
  const secure = (raw: string): string | null => {
    const url = absolute(raw);
    return url.startsWith("https://") ? url : null;
  };
  const priced = (amount: string, currency: string): string => {
    // Codes sit at even indices, marks at odd. A page that declares the
    // MARK as its currency ("₹") must come back as itself: indexing one
    // past it landed on the next CODE and printed rupees as "USD".
    const at = MARKS.indexOf(currency.toUpperCase());
    const mark = at % 2 === 0 ? (MARKS[at + 1] ?? currency) : currency;
    return amount === "" ? "" : `${mark} ${amount}`.trim();
  };
  const found: PageListing[] = [];
  const seen = new Set<string>();
  const add = (listing: PageListing): void => {
    const known = listing.href === "" || seen.has(listing.href);
    if (known || listing.title === "" || found.length >= MAX_LISTINGS) return;
    seen.add(listing.href);
    found.push(listing);
  };

  // 1. schema.org/Product as JSON-LD. `@graph`/`itemListElement`/`item` are
  // how that vocabulary wraps a list of them.
  const products: Node[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (value === null || typeof value !== "object") return;
    const node = value as Node;
    if (/Product/i.test(String(node["@type"] ?? ""))) products.push(node);
    ["@graph", "itemListElement", "item"].forEach((key) => walk(node[key]));
  };
  query('script[type="application/ld+json"]').forEach((script) => {
    try {
      walk(JSON.parse(script.textContent ?? ""));
    } catch {
      // A shop's malformed JSON is a fact about the shop, not an error here.
    }
  });
  const firstOf = (value: unknown): unknown =>
    Array.isArray(value) ? value[0] : value;
  const objectOf = (value: unknown): Node | null => {
    const first = firstOf(value);
    return typeof first === "object" && first !== null ? (first as Node) : null;
  };
  const ldImage = (node: Node): string | null => {
    const first = firstOf(node["image"]);
    if (typeof first === "string") return secure(first);
    const object = objectOf(first);
    return object === null ? null : secure(String(object["url"] ?? ""));
  };
  const ldPrice = (node: Node): string => {
    const offer = objectOf(node["offers"]);
    if (offer === null) return "";
    const nested = objectOf(offer["priceSpecification"]) ?? offer;
    return priced(
      String(nested["price"] ?? ""),
      String(nested["priceCurrency"] ?? ""),
    );
  };
  products.forEach((node) => {
    const offer = objectOf(node["offers"]);
    const url = String(node["url"] ?? offer?.["url"] ?? "");
    add({
      title: clean(String(node["name"] ?? "")),
      priceText: ldPrice(node),
      href: url === "" ? location.href : absolute(url),
      imageUrl: ldImage(node),
    });
  });

  // 2. The same vocabulary as microdata. `itemprop` is the standard's own
  // attribute, not a shop's class.
  const propText = (scope: Element, name: string): string => {
    const node = scope.querySelector(`[itemprop="${name}"]`);
    return node === null
      ? ""
      : clean(node.getAttribute("content") ?? node.textContent);
  };
  const propUrl = (scope: Element, name: string): string => {
    const node = scope.querySelector(`[itemprop="${name}"]`);
    const raw =
      node?.getAttribute("content") ??
      node?.getAttribute("href") ??
      node?.getAttribute("src") ??
      "";
    return raw === "" ? "" : absolute(raw);
  };
  query('[itemtype*="schema.org/Product"]').forEach((scope) => {
    const offers = scope.querySelector('[itemprop="offers"]') ?? scope;
    add({
      title: propText(scope, "name"),
      priceText: priced(
        propText(offers, "price"),
        propText(offers, "priceCurrency"),
      ),
      href: propUrl(scope, "url") || location.href,
      imageUrl: secure(propUrl(scope, "image")),
    });
  });

  // 3. OpenGraph describes the page, not a list — so only where it says the
  // page is a product, and only that one.
  const meta = (name: string): string =>
    clean(
      document
        .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
        ?.getAttribute("content"),
    );
  if (/product/i.test(meta("og:type"))) {
    add({
      title: meta("og:title"),
      priceText: priced(
        meta("product:price:amount"),
        meta("product:price:currency"),
      ),
      href: absolute(meta("og:url") || location.href),
      imageUrl: secure(meta("og:image")),
    });
  }

  return found;
}
