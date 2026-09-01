import type { CartDom } from "../cart/cart-dom.js";

/**
 * Functions in this file run *inside the page*, not in Node: puppeteer
 * stringifies them, so each one must be self-contained — no imports, no module
 * constants, helpers declared inline. They only read; nothing here types,
 * clicks or submits. That separation is why the classifier can be pure.
 */

export function selectorExists(selector: string): boolean {
  return document.querySelector(selector) !== null;
}

export function valueOfSelector(selector: string): string | null {
  const el = document.querySelector(selector);
  if (el === null) {
    return null;
  }
  // The live property, not the attribute: typing changes the former only, so
  // the attribute would report "empty" even for a field that was filled.
  return (el as HTMLInputElement).value ?? "";
}

export function textOfSelector(selector: string): string | null {
  const el = document.querySelector(selector);
  if (el === null) {
    return null;
  }
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function scrapeCartDom(): CartDom {
  const clean = (node: Element | null | undefined): string =>
    (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const priced = (text: string): boolean => /(₹|rs\.?|inr)\s*[0-9]/i.test(text);
  const rows = Array.from(
    document.querySelectorAll(
      "[data-cart-row],[data-testid*='cart-item'],tbody tr,li.cart-item,.cart-item,.line-item",
    ),
  )
    .map((node) => ({
      text: clean(node),
      priceText:
        clean(node.querySelector("[data-price],.price,.amount")) || null,
      qtyText: clean(node.querySelector("[data-qty],.qty,.quantity")) || null,
    }))
    .filter(
      (row) =>
        row.text.length > 0 && row.text.length <= 400 && priced(row.text),
    );
  const totalCandidates = Array.from(
    document.querySelectorAll(
      "[data-total],tfoot tr,tfoot td,.total,.grand-total,.order-total,.summary p,.summary li,p,li,td,th,div,span",
    ),
  )
    .map((node) => clean(node))
    .filter(
      (text) =>
        text.length <= 200 &&
        priced(text) &&
        /(total|payable|कुल|योग|देय)/i.test(text),
    )
    .slice(0, 40);
  return { rows, totalCandidates, url: location.href };
}
