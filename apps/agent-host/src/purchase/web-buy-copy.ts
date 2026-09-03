import { pageName } from "../browser/browser-view.js";

// What a picked errand says when it stops, and why it stopped. Kept beside
// the step rather than inside it so the sentences a shopper reads are
// reviewable as a list.

export const NOT_OPENED =
  "I could not get that listing open, so nothing was put in a basket. Nothing " +
  "has been spent and nothing has been signed. Tap the card again and I will " +
  "retry, or pick another.";

export const FORGOTTEN =
  "I no longer have that listing: the window has moved on since I showed it " +
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

/** Asked when the shop sent a one-time code after the host signed in. The
 *  code goes through chat by the shopper's own choice; the other tap is the
 *  wheel, where they type it without it ever crossing this process. */
export const ASK_CODE =
  "The shop has sent a one-time code to you. Tell me the code and I will " +
  "type it in, or take the wheel and enter it yourself.";

export const CODE_REPLIES: readonly string[] = ["I will type it myself"];

/** Said when the shopper tells the agent to carry on while the window is still
 *  theirs — the wheel has to come back before anything can. */
export const STILL_THEIRS =
  "The window is still yours: the shop is waiting on you there. Finish what " +
  "it is asking for and hand the wheel back, and I will pick up in the same " +
  "window with the basket still in it.";

/** The errand handed the window over and had no sentence of its own left to
 *  say about it. The card on screen names the exact ask; this line only says
 *  whose turn it is and what happens after. */
export const HANDED =
  "The shop is asking for something only you can give, so the window is " +
  "yours now. Finish it there and tell me when you are through; I will pick " +
  "up in the same window.";

/** The checkout ran past the errand's wall clock. The window is left exactly
 *  where it stands, so a resumed turn picks it up. */
export const CHECKOUT_RAN_LONG =
  "I ran out of time at that checkout: the window stopped answering me. It " +
  "is still open on the step I reached, and nothing was paid.";

export const STOPPED =
  "That is as far as I can take it. The payment step is yours: the window is " +
  "there, and I have not pressed anything that pays.";

/**
 * The checkout ended with nothing in the shop's basket — this host watched,
 * and its own record says no add-to-basket click landed. Saying "the payment
 * step is yours" over an empty basket was the contradiction class this
 * product has already shipped once; the honest sentence names the miss and
 * the way forward.
 */
export const NOT_CARTED =
  "I could not get it into that shop's basket, so nothing went in and " +
  "nothing was paid. Tap the card to have me try again, or pick another and " +
  "I will start there.";

export function detailOf(asking: boolean, waiting: boolean): string {
  if (asking) return "web_pick_address";
  return waiting ? "web_pick_waiting" : "web_pick";
}

/**
 * The closing tail is decided by what this host observed, never by what the
 * errand said: an expiry names the clock, an empty basket names the miss, and
 * only a checkout that really holds the thing, or really stands at the
 * shop's own payment step, hands that step over.
 */
export function endedWith(
  expired: boolean,
  carted: boolean,
  atPayment: boolean,
): string {
  if (expired) return CHECKOUT_RAN_LONG;
  return carted || atPayment ? STOPPED : NOT_CARTED;
}

export function closing(
  opened: readonly string[],
  listing: string,
  tail: string = STOPPED,
): string {
  const walked = opened.length === 0 ? [listing] : opened;
  const where = [...new Set(walked.map(pageName))].slice(-2).join(", ");
  return `Worked through ${where} in the sandbox window. ${tail}`;
}
