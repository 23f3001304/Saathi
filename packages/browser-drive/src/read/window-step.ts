import { normalize } from "../field/element-descriptor.js";
import * as P from "../field/patterns.js";
import type { PageDom } from "./page-dom.js";

/**
 * Which step of a shop's flow the window is standing on, where that step is one
 * the agent may not take. Read off the page with the same tables
 * `FieldClassifier` refuses on, so the page-level answer and the element-level
 * answer can never disagree.
 */
export interface StepSighting {
  readonly signal:
    | "payment_field"
    | "commit_button"
    | "password_field"
    | "sign_in_form"
    | "sign_in_page";
  /** The label that gave it away. A field's name, never its value. */
  readonly detail: string;
}

export type PaymentSighting = StepSighting;

const CREDENTIAL: readonly RegExp[] = [P.PASSWORD_NAMED, P.OTP_NAMED];

/**
 * Whether the shop is asking the shopper to sign in.
 *
 * DECISION: arrival, not reach. A real checkout puts a sign-in wall between the
 * basket and the address, and the agent used to land on it, find nothing it
 * could do, and report that as a dead end — the shopper read "sign-in is
 * needed" with no way to act on it and no window offered. The wall is a
 * handoff, and it is the one the session state machine has always had.
 *
 * Three readings, because one is not enough on a real shop. A password box is
 * the plain case. A box named like a credential catches a shop that hides the
 * type. And the URL catches the two-step sign-in the big shops ship: the first
 * screen asks only for an email and has no password box at all, so a
 * box-only reading walked straight past it — live, the agent pressed "Proceed
 * to checkout", landed on `/ap/signin`, and reported a dead end with nothing
 * offered. `LOGIN_URL` is the classifier's own table, already used by
 * `contextOfUrl` to flag exactly this navigation.
 */
export function signInPageIn(dom: PageDom): StepSighting | null {
  const declared = dom.controls.find(
    (control) => (control.type ?? "").toLowerCase() === "password",
  );
  if (declared !== undefined) {
    return { signal: "password_field", detail: declared.text };
  }
  const named = dom.controls.find(
    (control) =>
      control.kind === "field" &&
      CREDENTIAL.some((pattern) =>
        pattern.test(normalize(`${control.text} ${control.selector}`)),
      ),
  );
  if (named !== undefined) {
    return { signal: "sign_in_form", detail: named.text };
  }
  const scope = P.urlWords(dom.url);
  const wall = P.LOGIN_URL.test(scope) || P.REGISTER_URL.test(scope);
  return wall ? { signal: "sign_in_page", detail: dom.url } : null;
}

const INSTRUMENT: readonly RegExp[] = [
  P.CARD_NAMED,
  P.CARD_AUTOCOMPLETE,
  P.CVV_NAMED,
  P.UPI_PIN_NAMED,
  P.UPI_VPA_NAMED,
  P.BANK_ACCOUNT_NAMED,
];

/**
 * Whether the page in front of the agent is the payment step.
 *
 * DECISION: this is what "hand the wheel over at the payment page" means as
 * something the harness can *see*, rather than as a URL it hopes means the
 * right thing. Two signals, both read off the page: a box asking for a payment
 * instrument, or a button that commits. Either is enough; both are read with
 * the same tables `FieldClassifier` refuses on, so the page-level answer and
 * the element-level answer can never disagree.
 *
 * DECISION: the arrival is the handoff, not a button refusal. A refusal is what
 * the agent gets for *reaching* at something; this fires before it reaches at
 * anything, so the shopper is handed a payment page rather than a page plus an
 * error about the button somebody just tried to press.
 *
 * A shop whose payment step only offers saved instruments — no card box, no
 * commit button until the next screen — is not sighted here, and the agent may
 * take one more step before the commit button refuses it. No money moves
 * either way; the wheel simply arrives a screen later.
 */
export function paymentPageIn(dom: PageDom): StepSighting | null {
  const instrument = dom.controls.find(
    (control) =>
      control.kind === "field" &&
      INSTRUMENT.some((pattern) =>
        pattern.test(normalize(`${control.text} ${control.selector}`)),
      ),
  );
  if (instrument !== undefined) {
    return { signal: "payment_field", detail: instrument.text };
  }
  // A commit button alone is weaker: shops put "Place order" on a cart page
  // beside a "Proceed" that is the actual next step, and handing the wheel over
  // there is the thing this whole flow exists to stop doing. So it counts only
  // where nothing on the page moves the wizard on — the end of the line. The
  // floor never depends on this: the button itself is refused either way.
  const commit = dom.controls.find(
    (control) => control.kind === "button" && commits(normalize(control.text)),
  );
  const forward = dom.controls.some(
    (control) =>
      control.kind === "button" && P.isCheckoutStep(normalize(control.text)),
  );
  return commit === undefined || forward
    ? null
    : { signal: "commit_button", detail: commit.text };
}

function commits(text: string): boolean {
  return P.PAYMENT_BUTTON_EN.test(text) || P.PAYMENT_BUTTON_HI.test(text);
}
