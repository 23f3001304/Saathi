/** One money string a page printed, with the words it sits among. */
export interface PriceCandidate {
  readonly text: string;
  /** Roughly sixty characters either side, off the containing element's own
   *  text. A number alone cannot be told from a cart widget's total; the
   *  words beside it can, and reading them is the model's job rather than
   *  this host's. */
  readonly around: string;
}

/**
 * Runs inside the page, serialized over CDP, so it is one flat function with
 * every helper inline.
 *
 * A candidate is an element whose own text IS a money string, whole and alone
 * - "₹9,390.00", never "Under Rs. 700/month" - with anything struck through
 * excluded, because a was-price is the shop saying this is not the price.
 * Prominence orders them: a visible candidate by its own font size, a hidden
 * one (the accessibility span split-digit prices ship their readable copy in)
 * by the visible container it sits inside.
 *
 * DECISION: the list, not the winner. Picking the biggest number was this
 * host deciding which string was the price, and on a signed-out Amazon page
 * the biggest number was a cart widget's ₹0.00. What a page printed is a
 * fact; which of those is a product's price is a reading, and the reading
 * belongs to whoever can see the words around it.
 */
// eslint-disable-next-line max-lines-per-function
export function priceProbe(): PriceCandidate[] {
  const MAX = 8;
  const CONTEXT = 60;
  const WHOLE = /^(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d+)?$/;
  const owns = (el: Element): string =>
    Array.from(el.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
  const sizeOf = (el: Element): number => {
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      return Number.parseFloat(getComputedStyle(el).fontSize) || 0;
    }
    const parent = el.parentElement;
    if (parent === null) return 0;
    const held = parent.getBoundingClientRect();
    return held.width > 0 && held.height > 0
      ? Number.parseFloat(getComputedStyle(parent).fontSize) || 0
      : 0;
  };
  const nearby = (el: Element, text: string): string => {
    const flat = ((el.parentElement ?? el).textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const at = flat.indexOf(text);
    return at < 0
      ? flat.slice(0, CONTEXT * 2)
      : flat.slice(Math.max(at - CONTEXT, 0), at + text.length + CONTEXT);
  };
  const seen = new Set<string>();
  return (
    Array.from(document.querySelectorAll("span,div,p,ins,b,strong"))
      .filter((el) => el.closest("del,s,strike") === null)
      .map((el) => ({ text: owns(el), el }))
      .filter((held) => WHOLE.test(held.text))
      .map((held) => ({ ...held, size: sizeOf(held.el) }))
      .sort((a, b) => b.size - a.size)
      // One entry per distinct string: a split-digit price ships its readable
      // copy twice, and a repeat says nothing new about which number is which.
      .filter((held) => {
        const fresh = !seen.has(held.text);
        seen.add(held.text);
        return fresh;
      })
      .slice(0, MAX)
      .map((held) => ({ text: held.text, around: nearby(held.el, held.text) }))
  );
}
