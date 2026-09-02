import type { PageListing } from "../read/page-dom.js";

/**
 * The structural fallback, for pages that declare nothing standard — the
 * declared reader beside this one is asked first. Runs *inside the page*, like
 * `read-script.ts`, so every helper is inline and nothing is imported.
 *
 * DECISION: a tile is found from its *price*, not from its picture. The price
 * is the one thing a listing cannot be a listing without, and it is a short
 * piece of text: the smallest element carrying it, climbed up to the nearest
 * ancestor that also carries a link, is the row a person sees. Anchoring on the
 * image was tried first and is worse — a shop that loads its pictures lazily
 * has images with no box until you scroll, so a reader anchored on them reads
 * an empty page on exactly the shops that are slowest to load.
 *
 * DECISION: nothing here names a storefront. The rules are properties of
 * listings — a price, a link, a heading, a picture inside the same element —
 * and a page that has none of them yields nothing rather than yielding a guess.
 */
// eslint-disable-next-line max-lines-per-function
export function readTileListings(): readonly PageListing[] {
  const MAX_LISTINGS = 12;
  const MAX_PRICES = 120;
  const MAX_LABEL = 40;
  const MAX_TILE_TEXT = 900;
  const MAX_TEXT = 300;
  const CLIMB = 8;
  /** How far past the row to look for its picture, and no further. */
  const WIDEN = 3;
  /** A row carries its ratings, its badges and its delivery promise as well as
   *  its name, so it runs well past the cap that finds the row in the first
   *  place. The level bound above is what keeps this inside one row. */
  const MAX_ROW_TEXT = 4000;
  /** Short enough for any product name, long enough to exclude "M.R.P." */
  const MIN_TITLE = 8;
  /**
   * A currency marker is required, as it is in `cart/price.ts`: "20% off" and
   * "2 left" are not prices, and a card states a number under a picture. The
   * word boundary matters here and not there — this scans free text, and
   * without it "Compute*rs 1*" is a price of one rupee.
   */
  const PRICE = /(?:₹|\brs\.?|\binr\b|\$|€|£)\s*[0-9][0-9,]*(?:\.[0-9]{1,2})?/i;
  const clean = (value: string | null | undefined): string =>
    (value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  const flat = (el: Element): string =>
    (el.textContent ?? "").replace(/\s+/g, " ").trim();
  const secure = (raw: string): string | null =>
    raw.startsWith("https://") ? raw : null;
  const here = location.href.split("#")[0];
  /**
   * Where the row goes. `file:` is admitted alongside http(s) exactly as
   * `read-script.ts` admits it — the fixture shops are served that way, and
   * what may become a *pick* is decided one boundary out, where the host allows
   * http(s) and nothing else.
   *
   * A link back to this very page is not where the row goes: a row whose first
   * anchor was a bare `#` handed the card a link to the search results it was
   * already on, so tapping it would have gone nowhere at all.
   */
  const leadsAway = (node: Element): boolean => {
    const href = (node as HTMLAnchorElement).href;
    return /^https?:|^file:/.test(href) && href.split("#")[0] !== here;
  };
  const linkIn = (el: Element): string => {
    const anchor = Array.from(el.querySelectorAll("a[href]")).find(leadsAway);
    return anchor === undefined ? "" : (anchor as HTMLAnchorElement).href;
  };
  const pictureIn = (el: Element): string | null => {
    const image = el.querySelector("img") as HTMLImageElement | null;
    return image === null ? null : secure(image.currentSrc || image.src);
  };
  /**
   * The row's picture, which on a two-column layout sits beside the column
   * carrying its name and price rather than inside it.
   *
   * DECISION: widen only when the row itself has no picture at all. A row that
   * has one has answered the question — including when the answer is "one this
   * will not render", which is how a listing with an `http:` image quietly
   * borrowed the picture of the listing above it.
   */
  const pictureNear = (tile: Element): string | null => {
    if (tile.querySelector("img") !== null) return pictureIn(tile);
    let at: Element | null = tile.parentElement;
    for (let up = 0; at !== null && up < WIDEN; up += 1) {
      if (flat(at).length > MAX_ROW_TEXT) return null;
      const image = pictureIn(at);
      if (image !== null) return image;
      at = at.parentElement;
    }
    return null;
  };
  /**
   * What the row calls the thing: the longest of its headings, its picture's
   * alt text and its link texts.
   *
   * Longest of what is left after the furniture is dropped. A row's other
   * labels are its call to action and its widgets, and both can be longer than
   * the name: taking the first heading titled one shop's whole grid "verified
   * reviews", and taking the longest label titled a card "View product".
   * `FURNITURE` is the same shape of text rule the classifier uses on buttons,
   * and for the same reason — what a control says is what it is.
   */
  const FURNITURE =
    /^(view|shop now|buy now|add to|see (all|more)|more details|compare|quick (view|add)|select|choose)\b|^(sponsored|verified reviews?|reviews?|rating|sale|offer)$/i;
  const named = (text: string): boolean => text !== "" && !FURNITURE.test(text);
  const labelsOf = (el: Element): string[] => [
    ...Array.from(el.querySelectorAll("h1,h2,h3,h4")).map((node) =>
      clean(node.textContent),
    ),
    ...Array.from(el.querySelectorAll("a[href]")).map((node) =>
      clean(node.textContent),
    ),
    clean(el.querySelector("img")?.getAttribute("alt")),
  ];
  const titleIn = (el: Element): string =>
    labelsOf(el)
      .filter(named)
      .reduce((best, text) => (text.length > best.length ? text : best), "");
  /** Rendered at all — `read-script.ts`'s own test for an element worth
   *  describing, and the only visibility claim this reader makes. */
  const shown = (el: Element): boolean => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  /** The tile's text with struck-through content removed: <del>, <s> and
   *  <strike> are the page's own way of saying "no longer the price". */
  const liveText = (el: Element): string => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.parentElement?.closest("del,s,strike") !== null) continue;
      parts.push(node.textContent ?? "");
    }
    return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, MAX_TILE_TEXT);
  };
  const labels = (el: Element): boolean => {
    const text = flat(el);
    return text.length <= MAX_LABEL && PRICE.test(text) && shown(el);
  };
  /**
   * The row, not the price block: a link, a picture or a heading, and a name
   * long enough to be one. Climbing to the first ancestor with *any* link
   * landed inside a price cell — whose own links are the price and "M.R.P." —
   * and the card came out titled with the number it sat next to.
   */
  const shows = (el: Element): boolean =>
    el.querySelector("img") !== null ||
    el.querySelector("h1,h2,h3,h4") !== null;
  const rowLike = (el: Element): boolean =>
    linkIn(el) !== "" && shows(el) && titleIn(el).length >= MIN_TITLE;
  const tileOf = (label: Element): Element | null => {
    let at = label.parentElement;
    for (let up = 0; at !== null && up < CLIMB; up += 1) {
      if (flat(at).length > MAX_TILE_TEXT) return null;
      if (rowLike(at)) return at;
      at = at.parentElement;
    }
    return null;
  };
  const found: PageListing[] = [];
  const seen = new Set<string>();
  const add = (label: Element): void => {
    const tile = tileOf(label);
    if (tile === null || found.length >= MAX_LISTINGS) return;
    const href = linkIn(tile);
    const title = titleIn(tile);
    if (seen.has(href)) return;
    seen.add(href);
    // The row's first LIVE price. "First wins" assumed shops print what you
    // pay before what it was worth, but <del>₹4,999</del> ₹2,999 prints the
    // past first: anything struck through is excluded before the first
    // match, so the card quotes what the page asks, whichever order.
    const price = PRICE.exec(liveText(tile));
    found.push({
      title,
      priceText: price === null ? "" : price[0],
      href,
      imageUrl: pictureNear(tile),
    });
  };
  // Elements that could hold a price label. Not `*`: a price is text, and this
  // is every element a shop puts text in, which keeps the scan cheap on a page
  // with thousands of nodes.
  const labelled = Array.from(
    document.querySelectorAll(
      "span,div,p,b,strong,em,ins,bdi,h1,h2,h3,h4,h5,li,td,dd",
    ),
  )
    .filter(labels)
    .slice(0, MAX_PRICES);
  // The deepest match only. A whole row can be short enough to read as a price
  // label itself, and climbing from *that* lands on the page rather than on the
  // row — which is how one page became one listing called "Plain listings".
  labelled
    .filter(
      (el) => !labelled.some((other) => other !== el && el.contains(other)),
    )
    .forEach(add);
  return found;
}
