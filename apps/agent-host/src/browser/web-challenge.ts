import type { BrowserSession, PageDom } from "@covenant/browser-drive";
import { challengeIn } from "@covenant/browser-drive";

import type { WebResult } from "./web-result.js";
import { webFailure } from "./web-result.js";

/**
 * What the harness says when a shop asks to check the shopper is human.
 *
 * It is the sentence the model repeats — in the shopper's own language, per the
 * note every web tool result carries — and it says the three things a person
 * needs: what happened, that the agent will not attempt it, and that the window
 * on their screen is now theirs.
 */
const BOT_CHECK =
  "This shop is asking to check you are human. I cannot answer that for you " +
  "and I will not try — solving it is yours to do, by design. The window is " +
  "yours now: work through it there, and tell me when you are through. " +
  "Nothing is lost; I pick up in the same window where I stopped.";

/**
 * A bot check, turned from a dead end into a handoff.
 *
 * DECISION: the agent was already structurally unable to interact with one — a
 * challenge is a third-party document, and `RelayGate` refuses an opaque target
 * because "an unreadable target cannot be protected". What was missing was
 * anywhere for that to go: the errand read a page with nothing on it and
 * reported that it had found nothing, which is true and useless. This raises
 * the `captcha` handoff the session state machine has always had, so the wheel
 * moves to the shopper and the card offers them the window.
 *
 * DECISION: no attempt of any kind is made, here or anywhere below. Not a read
 * into the widget, not a click, not a solving service. The whole of the
 * agent's response to being asked to prove it is a person is to stop and say
 * who can answer that.
 *
 * The pause survives: a window in `user-drive` is refused retirement by
 * `sandboxOf` in `runner-wiring.ts` and is not reaped out from under the person
 * by `BrowserService`, so the basket they were halfway through is still there
 * when they hand the wheel back.
 */
export function botCheck(
  session: BrowserSession,
  dom: PageDom,
): WebResult | null {
  const sighting = challengeIn(dom);
  if (sighting === null) {
    return null;
  }
  const handoff = session.handoff().raise("captcha", dom.url);
  return webFailure("bot_check", BOT_CHECK, {
    signal: sighting.signal,
    detail: sighting.detail,
    handed_to_user: true,
    handoff_reason: handoff.reason,
    url: dom.url,
  });
}
