// The split this whole checkout flow rests on: which buttons on a checkout page
// move the wizard, and which commit. Both tables are asserted here, side by
// side, because the only thing separating them is rule order and a verb list —
// and a reviewer should be able to read the consequence of that in one file.
import type { Case } from "./classifier-case.js";
import { b, c, LOGIN, PAY } from "./classifier-case.js";

/**
 * Refused, exactly as before. Every one of these is caught by
 * `payment_button_text`, which runs ahead of the progression exemption: a label
 * in both tables is a commit.
 *
 * "Buy Now" is the case that matters most. On a real shop it is one-click — it
 * commits with a stored instrument and no further screen — so a progression
 * reading of the word "buy" would spend somebody's money. It stays refused.
 */
export const CHECKOUT_COMMIT_CASES: readonly Case[] = [
  b(
    "Buy Now is one click from spent",
    "Buy Now",
    { pageUrl: PAY },
    "payment_button",
    null,
  ),
  b("Buy it now", "Buy it now", { pageUrl: PAY }, "payment_button", null),
  b(
    "Place your order",
    "Place your order",
    { pageUrl: PAY },
    "payment_button",
    null,
  ),
  b("Pay now", "Pay now", { pageUrl: PAY }, "payment_button", null),
  b(
    "Proceed to pay reads as pay, not proceed",
    "Proceed to pay",
    { pageUrl: PAY },
    "payment_button",
    null,
  ),
  b(
    "Complete purchase",
    "Complete purchase",
    { pageUrl: PAY },
    "payment_button",
    null,
  ),
  b(
    "Confirm and pay",
    "Confirm and pay",
    { pageUrl: PAY },
    "payment_button",
    null,
  ),
  b("अभी खरीदें", "अभी खरीदें", { pageUrl: PAY }, "payment_button", null),
  // The fail-closed floor is untouched: a submit on a checkout page whose label
  // names neither table is still refused by the context rule.
  b(
    "an unnamed submit on checkout",
    "Submit",
    { pageUrl: PAY },
    "payment_context",
    "payment",
  ),
];

/**
 * Allowed. These move a form wizard one step and zero paise. Refusing them was
 * what handed the shopper the wheel at the cart and left them driving the whole
 * checkout by hand.
 */
export const CHECKOUT_STEP_CASES: readonly Case[] = [
  b(
    "Proceed to Buy is a step, not a purchase",
    "Proceed to Buy",
    { pageUrl: PAY },
    null,
  ),
  b("Continue", "Continue", { pageUrl: PAY }, null),
  b(
    "Deliver to this address",
    "Deliver to this address",
    { pageUrl: PAY },
    null,
  ),
  b("Use this address", "Use this address", { pageUrl: PAY }, null),
  b("Save and continue", "Save and continue", { pageUrl: PAY }, null),
  b("आगे बढ़ें", "आगे बढ़ें", { pageUrl: PAY }, null),
  // Scope still decides who owns a sign-in form: the exemption is written into
  // the payment rule alone, so a neutral Continue on a login page is unchanged.
  b(
    "Continue on a sign-in page is still theirs",
    "Continue",
    { pageUrl: LOGIN },
    "login_context",
    "login",
  ),
];

/**
 * The delivery form during checkout. The agent fills what the harness can name
 * from what the shopper stated, and nothing else — every credential rule is
 * consulted first, and anything unnameable is still refused.
 */
export const CHECKOUT_FIELD_CASES: readonly Case[] = [
  c(
    "Address line 1 on a checkout page",
    { name: "address-line1", labelText: "Address line 1", pageUrl: PAY },
    null,
  ),
  c(
    "Town or city",
    { name: "city", labelText: "Town or city", pageUrl: PAY },
    null,
  ),
  c("PIN code", { name: "pincode", labelText: "PIN code", pageUrl: PAY }, null),
  c(
    "Mobile number",
    { name: "phone", labelText: "Mobile number", pageUrl: PAY },
    null,
  ),
  c(
    "Card number is still card data",
    { name: "cardnumber", labelText: "Card number", pageUrl: PAY },
    "card",
    "payment",
  ),
  c(
    "CVV is still card data",
    { name: "cvv", labelText: "CVV", pageUrl: PAY },
    "cvv",
    "payment",
  ),
  c(
    "UPI PIN is still theirs",
    { name: "upipin", labelText: "UPI PIN", pageUrl: PAY },
    "upi_pin",
    "payment",
  ),
  // Named like a person's name, sitting on a card — the delivery table refuses
  // to claim anything carrying "card", so this falls to the fail-closed rule.
  // Declared as card data by the page's own `cc-*` naming, so the first band
  // of rules catches it long before any delivery reading could.
  c(
    "Name on card is card data",
    { name: "cc-name", labelText: "Name on card", pageUrl: PAY },
    "card",
    "payment",
  ),
  // Identity, not an address: a payment form asks for both of these too, so
  // they are left blank on a checkout page and named back as unfilled.
  c(
    "a recipient name on a checkout page",
    { name: "fullName", labelText: "Full name", pageUrl: PAY },
    "payment_context",
    "payment",
  ),
  c(
    "an email on a checkout page",
    { name: "email", labelText: "Email", pageUrl: PAY },
    "payment_context",
    "payment",
  ),
  c(
    "a field nothing recognises on a checkout page",
    { name: "giftmsg", labelText: "Gift message", pageUrl: PAY },
    "payment_context",
    "payment",
  ),
  // The exemption lives in the payment rule only: a sign-in form is theirs whole.
  c(
    "an address box inside a sign-in form",
    { name: "address", labelText: "Address", pageUrl: LOGIN },
    "login_context",
    "login",
  ),
];
