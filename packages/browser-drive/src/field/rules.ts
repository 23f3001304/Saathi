// Action, submit and context tables: what the agent may never click, and
// which page contexts hand control back to the user.
import type { HandoffReason } from "../session-state.js";
import {
  isActivatable,
  isSubmitControl,
  isTextEntry,
} from "./element-descriptor.js";
import { isDeliveryField } from "./delivery.js";
import * as P from "./patterns.js";

import { ENTRY_RULES, type FieldRule } from "./field-rules.js";

export type { FieldRule, RuleContext } from "./field-rules.js";

const ACTION_RULES: readonly FieldRule[] = [
  {
    id: "payment_button_text",
    category: "payment_button",
    // DECISION: refuse, do not hand over. A Buy Now on a product page made
    // the whole window the shopper's and the card announced "the payment
    // step" over an ordinary listing; the errand had been told to carry on
    // to add-to-cart and the wheel was already gone. The real payment page
    // still hands over, via `paymentPageIn` reading the page itself.
    handoff: null,
    authScoped: false,
    human:
      "That button commits the payment. Pressing it is the user's act, never the agent's.",
    matches: (d, c) =>
      isActivatable(d) &&
      (P.PAYMENT_BUTTON_EN.test(c.buttonText) ||
        P.PAYMENT_BUTTON_HI.test(c.buttonText)),
  },
  {
    id: "auth_button_text",
    category: "login_context",
    // Same shape as the payment button: the sign-in PAGE hands over (or the
    // vault signs in); a stray sign-in button aimed at mid-errand refuses.
    handoff: null,
    authScoped: true,
    human:
      "That button signs in or signs up. The agent does not enter an account in your name — the window is yours.",
    matches: (d, c) =>
      isSubmitControl(d) &&
      (P.AUTH_BUTTON_EN.test(c.buttonText) ||
        P.AUTH_BUTTON_HI.test(c.buttonText)),
  },
  {
    id: "captcha_context",
    category: "login_context",
    handoff: "captcha",
    authScoped: false,
    human: "That is a bot check. Solving it is yours to do, by design.",
    matches: (_d, c) => P.CAPTCHA_MARKERS.test(c.context),
  },
];

function submitIn(
  id: string,
  handoff: HandoffReason,
  pattern: RegExp,
  human: string,
  authScoped = false,
): FieldRule {
  return {
    id,
    category: handoff === "payment" ? "payment_context" : "login_context",
    handoff,
    authScoped,
    human,
    matches: (d, c) => isSubmitControl(d) && pattern.test(c.scope),
  };
}

/**
 * The same rule for the checkout scope, minus the buttons that only move the
 * wizard along.
 *
 * DECISION: scope alone was too blunt. Every submit under a `/checkout` path
 * was refused, so the agent put a thing in the basket, pressed nothing, and
 * handed over a shopper who then had to drive the whole checkout by hand — and
 * hand-fill the address fields this harness already knew how to fill. What the
 * scope is really saying is "be careful here", and the careful reading is the
 * label: `PAYMENT_BUTTON_EN` still refuses anything that commits, and it is
 * consulted first (see `FIELD_RULES`), so this exemption can never reach a
 * button that pays. What it frees is "Proceed to Buy", "Continue", "Deliver to
 * this address" — zero paise, one step forward.
 */
function checkoutSubmit(human: string): FieldRule {
  return {
    id: "payment_submit_context",
    category: "payment_context",
    handoff: "payment",
    authScoped: false,
    human,
    matches: (d, c) =>
      isSubmitControl(d) &&
      P.PAYMENT_URL.test(c.scope) &&
      !P.isCheckoutStep(c.buttonText),
  };
}

/**
 * Following a link out of a login page is browsing; pressing its button is
 * signing in. Only the second is refused, which is why these test
 * `isSubmitControl` rather than `isActivatable`.
 */
const SUBMIT_RULES: readonly FieldRule[] = [
  submitIn(
    "auth_submit_context",
    "login",
    new RegExp(`${P.LOGIN_URL.source}|${P.REGISTER_URL.source}`),
    "Submitting a sign-in form is signing in, and the agent does not sign in as you.",
    true,
  ),
  submitIn(
    "otp_submit_context",
    "otp",
    P.OTP_URL,
    "Submitting a verification form is your act, not the agent's.",
  ),
  checkoutSubmit(
    "That button is not a step in a form — it commits. Buttons that commit on a payment page are yours to press.",
  ),
];

/** Last, so a password on a login page reports `password`, not `login_context`. */
const CONTEXT_RULES: readonly FieldRule[] = [
  {
    id: "registration_form_context",
    category: "login_context",
    handoff: "account-creation",
    authScoped: false,
    human:
      "That field sits inside an account-creation form. The agent does not create accounts in your name.",
    matches: (d, c) => isTextEntry(d) && P.REGISTER_URL.test(c.scope),
  },
  {
    id: "login_form_context",
    category: "login_context",
    handoff: "login",
    authScoped: false,
    human:
      "That field sits inside a sign-in form, so the whole form is yours to fill.",
    matches: (d, c) => isTextEntry(d) && P.LOGIN_URL.test(c.scope),
  },
  {
    id: "otp_form_context",
    category: "otp",
    handoff: "otp",
    authScoped: false,
    human: "That form is a verification challenge. It is yours to complete.",
    matches: (d, c) => isTextEntry(d) && P.OTP_URL.test(c.scope),
  },
  /**
   * The fail-closed default on a checkout page, minus the boxes this harness
   * positively recognises as a delivery address.
   *
   * DECISION: the rule's own reasoning is unchanged — "a field nobody
   * recognised on a payment page is exactly the field worth not typing into".
   * A delivery address *is* recognised (`field/delivery.ts`), and it is not a
   * credential: it is a fact the shopper stated about themselves, filled from
   * trait memory and from nowhere else. Every credential rule in
   * `ENTRY_RULES` is consulted before this one, so a card number, a CVV, a UPI
   * PIN or a bank account is refused by name long before the exemption is
   * reached — and anything this table cannot name is still refused here.
   */
  {
    id: "payment_form_context",
    category: "payment_context",
    handoff: "payment",
    authScoped: false,
    human:
      "That field sits inside a checkout or payment form and is not a delivery address. The agent fills nothing else here.",
    matches: (d, c) =>
      isTextEntry(d) &&
      P.PAYMENT_URL.test(c.scope) &&
      !isDeliveryField(c.words),
  },
];

/**
 * Order is the policy: a field that identified itself (ENTRY_RULES, banded in
 * field-rules.ts) outranks a click rule, which outranks the surrounding
 * context. Context is last so a password on a login page reports `password`
 * with a login handoff, not the vaguer `login_context`.
 */
export const FIELD_RULES: readonly FieldRule[] = [
  ...ENTRY_RULES,
  ...ACTION_RULES,
  ...SUBMIT_RULES,
  ...CONTEXT_RULES,
];
