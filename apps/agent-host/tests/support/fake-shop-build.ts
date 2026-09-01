// How a page of the little shop is put together. Split from the page table so
// neither file has to be read to understand the other.
import type {
  CartDom,
  ElementDescriptor,
  PageControlDom,
  PageDom,
} from "@covenant/browser-drive";

const EMPTY_CART: CartDom = { rows: [], totalCandidates: [], url: "" };

export function button(selector: string, text: string): PageControlDom {
  return { selector, kind: "button", text, type: "submit" };
}

export function field(
  selector: string,
  text: string,
  type: string,
): PageControlDom {
  return { selector, kind: "field", text, type };
}

/**
 * The descriptor a real reader would have produced for this control, so the
 * *real* `FieldClassifier` makes the decision in these tests. Nothing here
 * decides that "Place order" is a payment button — the classifier does, from
 * the same text a browser would have handed it.
 */
export function descriptorOf(
  control: PageControlDom,
  pageUrl: string,
): ElementDescriptor {
  return {
    selector: control.selector,
    tag: control.kind === "button" ? "button" : "input",
    inputType: control.kind === "button" ? null : control.type,
    name: control.selector.replace("#", ""),
    id: control.selector.replace("#", ""),
    autocomplete: null,
    placeholder: control.kind === "field" ? control.text : null,
    ariaLabel: null,
    labelText: control.kind === "field" ? control.text : null,
    nearbyText: null,
    inputMode: null,
    pattern: null,
    maxLength: null,
    text: control.kind === "button" ? control.text : null,
    formAction: null,
    pageUrl,
  };
}

export interface ShopPage {
  readonly dom: PageDom;
  readonly cart: CartDom;
}

export function page(
  url: string,
  over: Partial<PageDom> & { readonly cart?: CartDom },
): ShopPage {
  const { cart, ...rest } = over;
  return {
    dom: {
      url,
      title: "Runners",
      heading: null,
      blocks: [],
      links: [],
      controls: [],
      listings: [],
      frames: [],
      searchSelector: null,
      ...rest,
    },
    cart: cart ?? { ...EMPTY_CART, url },
  };
}
