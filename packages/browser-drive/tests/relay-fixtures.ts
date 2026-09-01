import { el } from "./fakes.js";

// The four targets the relay tests aim at: two the classifier refuses, two it
// waves through. Shared so the expectations sit next to each other.

export const CHECKOUT = "https://bazaar.example/checkout";
export const PRODUCT = "https://bazaar.example/products/trailfoot-runner";

export const CARD = el({
  selector: "#card-number",
  name: "cardNumber",
  autocomplete: "cc-number",
  pageUrl: CHECKOUT,
});

export const PASSWORD = el({
  selector: "#password",
  inputType: "password",
  name: "password",
  pageUrl: "https://bazaar.example/account/signin",
});

export const SIZE_SELECTOR = el({
  selector: "#size",
  name: "size",
  labelText: "Size",
  pageUrl: PRODUCT,
});

export const QUANTITY = el({
  selector: "#qty",
  inputType: "number",
  name: "quantity",
  labelText: "Quantity",
  pageUrl: PRODUCT,
});

