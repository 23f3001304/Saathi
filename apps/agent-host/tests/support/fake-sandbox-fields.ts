// The one page these tests stand on: a sign-in form with a password box and a
// search box, described flat so the classifier can be exercised without Chrome.
import type { ElementDescriptor } from "@covenant/browser-drive";

export const LOGIN = "https://bazaar.example/account/signin";

function el(over: Partial<ElementDescriptor>): ElementDescriptor {
  return {
    selector: "#field",
    tag: "input",
    inputType: "text",
    name: null,
    id: null,
    autocomplete: null,
    placeholder: null,
    ariaLabel: null,
    labelText: null,
    nearbyText: null,
    inputMode: null,
    pattern: null,
    maxLength: null,
    text: null,
    formAction: null,
    pageUrl: LOGIN,
    ...over,
  };
}

export const PASSWORD_BOX = { x: 20, y: 40, width: 120, height: 24 };
export const PASSWORD = el({
  selector: "#password",
  id: "password",
  inputType: "password",
  name: "password",
});
export const SEARCH = el({
  selector: "#q",
  id: "q",
  inputType: "search",
  name: "q",
  pageUrl: "https://bazaar.example/products/trailfoot-runner",
});
