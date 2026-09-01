import { pageName } from "../browser/browser-view.js";

// What a picked errand says when it stops, and why it stopped. Kept beside
// the step rather than inside it so the sentences a shopper reads are
// reviewable as a list — the same split `web-look-copy.ts` makes.

export const NOT_OPENED =
  "I could not get that listing open, so nothing was put in a basket. Nothing " +
  "has been spent and nothing has been signed.";

export const FORGOTTEN =
  "I no longer have that listing — the window has moved on since I showed it " +
  "to you. Ask me to look again and I will offer them fresh.";

/** The one question a picked errand may stop on. Harness-written, so a run
 *  that filled a form always asks it and one that did not never can. */
export const CONFIRM_ADDRESS =
  "That is the delivery address I have from what you have told me. Is it " +
  "correct? Say yes and I will carry on to the payment step; tell me what to " +
  "change and I will put that in instead.";

/** Tappable answers to `CONFIRM_ADDRESS`. Two, because there are two: it is
 *  right, or it is not and they will say what to change. */
export const ADDRESS_REPLIES: readonly string[] = [
  "Yes, that is right",
  "Change the address",
];

/** Said when the shopper tells the agent to carry on while the window is still
 *  theirs — the wheel has to come back before anything can. */
export const STILL_THEIRS =
  "The window is still yours — the shop is waiting on you there. Finish what " +
  "it is asking for and hand the wheel back, and I will pick up in the same " +
  "window with the basket still in it.";

/** The checkout ran past the errand's wall clock. The window is left exactly
 *  where it stands, so a resumed turn picks it up. */
export const CHECKOUT_RAN_LONG =
  "I ran out of time at that checkout — the window stopped answering me. It " +
  "is still open on the step I reached, and nothing was paid.";

export const STOPPED =
  "That is as far as I can take it. The payment step is yours — the window is " +
  "there, and I have not pressed anything that pays.";

export function detailOf(asking: boolean, waiting: boolean): string {
  if (asking) return "web_pick_address";
  return waiting ? "web_pick_waiting" : "web_pick";
}

export function closing(opened: readonly string[], listing: string): string {
  const walked = opened.length === 0 ? [listing] : opened;
  const where = [...new Set(walked.map(pageName))].slice(-2).join(", ");
  return `Worked through ${where} in the sandbox window. ${STOPPED}`;
}
