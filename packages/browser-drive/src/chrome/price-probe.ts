/** One money string a page printed, with the words it sits among. */
export interface PriceCandidate {
  readonly text: string;
  /** Roughly sixty characters either side, off the containing element's own
   *  text. A number alone cannot be told from a cart widget's total; the
   *  words beside it can, and reading them is the model's job rather than
   *  this host's. */
  readonly around: string;
}

/** A candidate before it has been ranked, carrying the font size it was
 *  rendered at. Prominence is measurable only inside the page, so it comes
 *  back with the string and is spent out here. */
export interface ScannedPrice extends PriceCandidate {
  readonly size: number;
}

/** How many money strings the model is handed. The ±60 characters `around`
 *  reaches is written into `scanPrices` itself: that function is stringified
 *  and run inside the page, so it can close over nothing out here. */
const MAX = 8;

/**
 * Runs inside the page, serialized over CDP, so it is one flat function with
 * every helper inline - and nothing but collection in it, so that it stays
 * short enough to read.
 *
 * A candidate is an element whose own text IS a money string, whole and alone
 * - "₹9,390.00", never "Under Rs. 700/month" - with anything struck through
 * excluded, because a was-price is the shop saying this is not the price.
 * `size` is what prominence is measured on: a visible candidate's own font
 * size, or, for a hidden one (the accessibility span split-digit prices ship
 * their readable copy in), the visible container it sits inside.
 */
export function scanPrices(): ScannedPrice[] {
  const WHOLE = /^(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d+)?$/;
  const owns = (el: Element): string =>
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
  const shown = (el: Element | null): number => {
    if (el === null) return 0;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return 0;
    return Number.parseFloat(getComputedStyle(el).fontSize) || 0;
  };
  const nearby = (el: Element, text: string): string => {
    const flat = ((el.parentElement ?? el).textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const at = flat.indexOf(text);
    return at < 0
      ? flat.slice(0, 120)
      : flat.slice(Math.max(at - 60, 0), at + text.length + 60);
  };
  return Array.from(document.querySelectorAll("span,div,p,ins,b,strong"))
    .filter((el) => el.closest("del,s,strike") === null)
    .map((el) => ({ el, text: owns(el) }))
    .filter((held) => WHOLE.test(held.text))
    .map((held) => ({
      text: held.text,
      around: nearby(held.el, held.text),
      size: shown(held.el) || shown(held.el.parentElement),
    }));
}

/**
 * The reading, done out here where it can be read: biggest first, one entry
 * per distinct string, and never more than a handful.
 *
 * DECISION: the list, not the winner. Picking the biggest number was this
 * host deciding which string was the price, and on a signed-out Amazon page
 * the biggest number was a cart widget's ₹0.00. What a page printed is a
 * fact; which of those is a product's price is a reading, and the reading
 * belongs to whoever can see the words around it.
 *
 * De-duplication is by string alone: a split-digit price ships its readable
 * copy twice, and a repeat says nothing new about which number is which.
 */
export function rankPrices(
  found: readonly ScannedPrice[],
): readonly PriceCandidate[] {
  const seen = new Set<string>();
  return [...found]
    .sort((a, b) => b.size - a.size)
    .filter((held) => {
      const fresh = !seen.has(held.text);
      seen.add(held.text);
      return fresh;
    })
    .slice(0, MAX)
    .map((held) => ({ text: held.text, around: held.around }));
}
