import type { FieldSnapshot } from "../ports.js";

/**
 * Which elements the in-page reader should describe. One query type rather than
 * four readers, because there is exactly one descriptor builder in this package
 * and a second one would be a second security policy: the classifier is only as
 * good as the fields it is handed.
 */
export type ElementQuery =
  | { readonly kind: "selector"; readonly selector: string }
  | { readonly kind: "point"; readonly x: number; readonly y: number }
  | { readonly kind: "focused" }
  | { readonly kind: "fields" };

/*
 * eslint-disable-next-line max-lines-per-function --
 * Puppeteer stringifies this function into the page, so every helper it uses
 * has to be declared inside it, and one descriptor must be one atomic snapshot
 * of one element — splitting it into two `evaluate` round-trips would let the
 * DOM move between the read and the decision made about it. The body is a flat
 * list of field reads inside named closures, which is the thing the line limit
 * exists to keep readable; the limit is waived here and in `page-script.ts`
 * and nowhere else.
 *
 * KNOWN LIMIT: same-document only. A field inside a cross-origin iframe (a
 * hosted card form) is invisible to this reader, so it is neither classified
 * nor redacted. That is why a payment context hands off natively instead of
 * being driven through the relay at all.
 */
// eslint-disable-next-line max-lines-per-function
export function readElements(query: ElementQuery): FieldSnapshot[] {
  const clean = (value: string | null | undefined): string | null => {
    const text = (value ?? "").replace(/\s+/g, " ").trim();
    return text === "" ? null : text;
  };
  const list = (el: Element | null): Element[] => (el === null ? [] : [el]);
  const targets = (): Element[] => {
    if (query.kind === "selector") {
      return list(document.querySelector(query.selector));
    }
    if (query.kind === "point") {
      return list(document.elementFromPoint(query.x, query.y));
    }
    if (query.kind === "focused") {
      return list(document.activeElement);
    }
    return Array.from(
      document.querySelectorAll(
        "input,textarea,select,[contenteditable='true']",
      ),
    ).slice(0, 400);
  };
  const nameOf = (el: Element): string => {
    if (query.kind === "selector") return query.selector;
    const id = el.getAttribute("id");
    if (id !== null && id !== "") return `#${id}`;
    const named = el.getAttribute("name");
    const tag = el.tagName.toLowerCase();
    return named === null || named === "" ? tag : `${tag}[name="${named}"]`;
  };
  const labelOf = (el: Element): string | null => {
    const label =
      el.id === ""
        ? el.closest("label")
        : (document.querySelector(`label[for="${el.id}"]`) ??
          el.closest("label"));
    return clean(label?.textContent);
  };
  const maxLengthOf = (el: Element): number | null => {
    const max = Number((el as HTMLInputElement).maxLength);
    return Number.isFinite(max) && max > 0 ? max : null;
  };
  const describe = (el: Element) => ({
    selector: nameOf(el),
    tag: el.tagName.toLowerCase(),
    inputType: el.getAttribute("type"),
    name: el.getAttribute("name"),
    id: el.getAttribute("id"),
    autocomplete: el.getAttribute("autocomplete"),
    placeholder: el.getAttribute("placeholder"),
    ariaLabel: el.getAttribute("aria-label"),
    inputMode: el.getAttribute("inputmode"),
    pattern: el.getAttribute("pattern"),
    pageUrl: location.href,
    labelText: labelOf(el),
    nearbyText: clean(el.parentElement?.textContent)?.slice(0, 240) ?? null,
    maxLength: maxLengthOf(el),
    text:
      clean(el.textContent)?.slice(0, 160) ?? clean(el.getAttribute("value")),
    formAction: el.closest("form")?.getAttribute("action") ?? null,
  });
  const rectOf = (el: Element) => {
    const box = el.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };
  return targets().map((el) => ({ descriptor: describe(el), rect: rectOf(el) }));
}
