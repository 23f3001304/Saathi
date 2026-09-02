import type { Case } from "./classifier-case.js";
import { b, c, link, LOGIN, PAY, REG, VERIFY } from "./classifier-case.js";
import { AUTH_BUTTON_CASES, SUBMIT_CASES } from "./cases-submits.js";

/** Button text that commits money, in English. */
export const PAYMENT_BUTTON_EN_CASES: readonly Case[] = [
  b("Pay", "Pay", {}, "payment_button", null),
  b("Pay now", "Pay now", {}, "payment_button", null),
  b("Pay securely", "Pay securely", {}, "payment_button", null),
  b("Make payment", "Make payment", {}, "payment_button", null),
  b("Submit payment", "Submit payment", {}, "payment_button", null),
  b("Proceed to pay", "Proceed to pay", {}, "payment_button", null),
  b("Place order", "Place order", {}, "payment_button", null),
  b("Place your order", "Place your order", {}, "payment_button", null),
  b("Buy now", "Buy now", {}, "payment_button", null),
  b("Buy it now", "Buy it now", {}, "payment_button", null),
  b("Order now", "Order now", {}, "payment_button", null),
  b("Complete purchase", "Complete purchase", {}, "payment_button", null),
  b("Confirm and pay", "Confirm and pay", {}, "payment_button", null),
  b("Confirm order", "Confirm order", {}, "payment_button", null),
  b("Authorise payment", "Authorise payment", {}, "payment_button", null),
  b("Authorize payment", "Authorize payment", {}, "payment_button", null),
  b("PAY NOW shouting", "PAY NOW", {}, "payment_button", null),
  b(
    "input type=submit with pay value",
    "Pay now",
    { tag: "input", inputType: "submit" },
    "payment_button",
    null,
  ),
];

/**
 * The same rule in Hindi. A classifier that only reads English is a classifier
 * that fails in the market this is built for.
 */
export const PAYMENT_BUTTON_HI_CASES: readonly Case[] = [
  b("भुगतान करें", "भुगतान करें", {}, "payment_button", null),
  b("भुगतान", "भुगतान", {}, "payment_button", null),
  b("अभी भुगतान करें", "अभी भुगतान करें", {}, "payment_button", null),
  b("पेमेंट", "पेमेंट", {}, "payment_button", null),
  b("अभी खरीदें", "अभी खरीदें", {}, "payment_button", null),
  b("खरीदें", "खरीदें", {}, "payment_button", null),
  b("ऑर्डर करें", "ऑर्डर करें", {}, "payment_button", null),
  b("आर्डर दें", "आर्डर दें", {}, "payment_button", null),
  b("आदेश दें", "आदेश दें", {}, "payment_button", null),
  // Deliberate over-block: "payment method" is a heading, not a commit, but a
  // bare भुगतान on a *button* is refused anyway. Fail closed.
  b(
    "भुगतान विधि (over-block, intended)",
    "भुगतान विधि",
    {},
    "payment_button",
    null,
  ),
];

export const CONTEXT_CASES: readonly Case[] = [
  c(
    "email field on a login page",
    { name: "email", pageUrl: LOGIN },
    "login_context",
    "login",
  ),
  c(
    "email field on a sign-up page",
    { name: "email", pageUrl: REG },
    "login_context",
    "account-creation",
  ),
  c(
    "code field on a challenge page",
    { name: "code", pageUrl: VERIFY },
    "otp",
    "otp",
  ),
  c(
    "even a plain name field on checkout is refused",
    { name: "fullName", pageUrl: PAY },
    "payment_context",
    "payment",
  ),
  c(
    "form action alone marks the context",
    { name: "email", formAction: "/checkout/pay" },
    "payment_context",
    "payment",
  ),
  c(
    "sign-in form action on an unremarkable page",
    { name: "username", formAction: "/signin" },
    "login_context",
    "login",
  ),
  c("name=captcha", { name: "captcha" }, "login_context", "captcha"),
  c(
    "an input beside a robot check",
    { name: "answer", nearbyText: "I am not a robot" },
    "login_context",
    "captcha",
  ),
];

/** The other half of the matrix: what must stay usable. */
export const ALLOWED_CASES: readonly Case[] = [
  c("catalogue search box", { name: "q", inputType: "search" }, null),
  c("size field on a product page", { name: "size" }, null),
  c("quantity field", { name: "quantity" }, null),
  c("gift message textarea", { tag: "textarea", name: "giftMessage" }, null),
  c(
    "delivery pincode is not a PIN",
    { name: "pincode", maxLength: 6, inputMode: "numeric" },
    null,
  ),
  c(
    "newsletter email on a product page",
    { name: "email", inputType: "email" },
    null,
  ),
  b("Add to cart", "Add to cart", {}, null),
  b("Apply coupon", "Apply coupon", {}, null),
  b("Continue shopping", "Continue shopping", {}, null),
  b("Search", "Search", {}, null),
  b("Payment methods is a heading, not a commit", "Payment methods", {}, null),
  link("Proceed to checkout link", "Proceed to checkout", {}, null),
  link("View product", "View product", {}, null),
  link("Log out", "Log out", {}, null),
  // A link to the sign-in page is browsing. The rule reads submit controls
  // only, so "go and sign in" stays reachable while "sign in" does not.
  link("Sign in link in the header", "Sign in", {}, null),
  link(
    "following a link out of a login page is browsing, not signing in",
    "Home",
    { pageUrl: LOGIN },
    null,
  ),
];

export const ACTION_CASES: readonly Case[] = [
  ...PAYMENT_BUTTON_EN_CASES,
  ...PAYMENT_BUTTON_HI_CASES,
  ...AUTH_BUTTON_CASES,
  ...SUBMIT_CASES,
  ...CONTEXT_CASES,
  ...ALLOWED_CASES,
];
