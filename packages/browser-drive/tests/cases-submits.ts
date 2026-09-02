// Pressing a button that completes an auth or checkout flow. Kept beside
// cases-actions.ts rather than inside it: these are the rules that decide what
// the agent may *finish*, and they earn their own table.
import type { Case } from "./classifier-case.js";
import { b, LOGIN, PAY, REG, VERIFY } from "./classifier-case.js";

/**
 * A button that says what it does, on a page whose URL says nothing. Found by
 * pointing the reader at a real public shop served from its bare domain: every
 * URL-scoped rule abstained and "Login" was pressable.
 */
export const AUTH_BUTTON_CASES: readonly Case[] = [
  b(
    "Login on a page whose URL hides it",
    "Login",
    {},
    "login_context",
    null,
  ),
  b("Log in", "Log in", {}, "login_context", null),
  b("Sign in", "Sign in", {}, "login_context", null),
  b("Sign up", "Sign up", {}, "login_context", null),
  b("Create an account", "Create an account", {}, "login_context", null),
  b(
    "Continue with Google",
    "Continue with Google",
    {},
    "login_context",
    null,
  ),
  b("लॉग इन", "लॉग इन", {}, "login_context", null),
  b("साइन अप", "साइन अप", {}, "login_context", null),
  b(
    "input type=submit whose value is the verb",
    "Login",
    { tag: "input", inputType: "submit" },
    "login_context",
    null,
  ),
];

/** Submitting an auth or checkout form is completing it. */
export const SUBMIT_CASES: readonly Case[] = [
  b(
    "a neutral Continue button on a sign-in page still submits it",
    "Continue",
    { pageUrl: LOGIN },
    "login_context",
    "login",
  ),
  b(
    "Sign in button on a login page",
    "Sign in",
    { pageUrl: LOGIN },
    "login_context",
    null,
  ),
  b(
    "Create account button on a sign-up page",
    "Create account",
    { pageUrl: REG },
    "login_context",
    "account-creation",
  ),
  b(
    "Verify button on a challenge page",
    "Verify",
    { pageUrl: VERIFY },
    "login_context",
    "otp",
  ),
  // A neutral Continue on checkout used to be refused here. It is not any
  // more: see `cases-checkout.ts`. Refusing every submit under `/checkout`
  // handed the shopper the wheel at the cart and left them hand-filling the
  // address; what commits is now decided by the label, and `PAYMENT_BUTTON_EN`
  // still reads that first.
  b(
    "an unnamed submit on checkout is still refused",
    "Submit",
    { pageUrl: PAY },
    "payment_context",
    "payment",
  ),
];
