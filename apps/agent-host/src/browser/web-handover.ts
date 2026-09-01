import type {
  BrowserSession,
  HandoffReason,
  PageDom,
  StepSighting,
} from "@covenant/browser-drive";
import { paymentPageIn, signInPageIn } from "@covenant/browser-drive";

import { botCheck } from "./web-challenge.js";
import type { WebResult } from "./web-result.js";
import { webFailure } from "./web-result.js";

/**
 * What the harness says on arriving at the payment step. It is the sentence
 * the model repeats in the shopper's own language, and it says the two things
 * that matter: how far the agent got, and that the rest is theirs.
 */
const SIGN_IN =
  "This shop wants you signed in before it will go any further. I never type " +
  "credentials, so the window is yours: sign in there and tell me when you " +
  "are through, and I will pick up in the same window — the basket is still " +
  "in it.";

const AT_PAYMENT =
  "This is the payment step. I have taken it as far as I can — every field " +
  "and every button here is yours, and I have pressed nothing that pays. The " +
  "window is yours now.";

/**
 * The two reasons the window stops being the agent's, asked on every read.
 *
 * Order is the policy, and it is the order they happen in on a real checkout: a
 * shop checks you are human, then that you are signed in, then it takes your
 * money. A page that is more than one of those is named by the earliest.
 */
export function handOver(
  session: BrowserSession,
  dom: PageDom,
  onHandover: (reason: HandoffReason) => void = () => undefined,
): WebResult | null {
  const challenge = botCheck(session, dom);
  if (challenge !== null) {
    onHandover("captcha");
    return challenge;
  }
  const signIn = signInPageIn(dom);
  if (signIn !== null) {
    return stop(session, dom, onHandover, "login", SIGN_IN, signIn);
  }
  const payment = paymentPageIn(dom);
  return payment === null
    ? null
    : stop(session, dom, onHandover, "payment", AT_PAYMENT, payment);
}

function stop(
  session: BrowserSession,
  dom: PageDom,
  onHandover: (reason: HandoffReason) => void,
  reason: HandoffReason,
  human: string,
  sighting: StepSighting,
): WebResult {
  onHandover(reason);
  const handoff = session.handoff().raise(reason, dom.url);
  return webFailure(`at_${reason}_step`, human, {
    signal: sighting.signal,
    detail: sighting.detail,
    handed_to_user: true,
    handoff_reason: handoff.reason,
    url: dom.url,
  });
}
