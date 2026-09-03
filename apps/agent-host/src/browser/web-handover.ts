import type { PageDom } from "@covenant/browser-drive";
import {
  challengeIn,
  paymentPageIn,
  signInPageIn,
} from "@covenant/browser-drive";

/** The shape the three drive-layer readings share: what fired, and the label
 *  that carried it. Named here so this file depends on neither reading. */
interface Sighting {
  readonly signal: string;
  readonly detail: string;
}

/** What a page can look like from here. Three looks, no fourth: these are the
 *  three the drive layer can see structurally, and it says which. */
export type WindowLook = "payment" | "sign-in" | "human-check";

export interface WindowObservation {
  readonly looks_like: readonly WindowLook[];
  /** What gave each look away, in the same order: the signal that fired and
   *  the label that carried it. A field's name, never its value. */
  readonly because: readonly string[];
}

/**
 * What the page in front of the agent looks like, as an observation and
 * nothing more.
 *
 * DECISION: this used to be `handOver()`, and it stopped the errand where it
 * stood. A product page with a Buy Now button on it satisfies `paymentPageIn`
 * — that is what "Buy Now" is in `PAYMENT_BUTTON_EN` — so the host decided a
 * listing *was* the payment step and gave the window away before the errand
 * had made one move (`web_pick.close handed: payment, carted: false,
 * filled: 0`). The DOM reading was not wrong about the button; it was wrong to
 * be the decision. So it becomes what it always honestly was: a sighting the
 * model reads along with the rest of the page, and weighs against everything
 * else it can see there.
 *
 * DECISION: nothing here touches the session. It is pure, and it is the whole
 * of what a read now does about these three pages. What moves the wheel is
 * `HandoverMove`, called by name, by the model, in `web-handover-move.ts`. The
 * floor is unchanged either way: `FieldClassifier` still refuses any control
 * that pays, whoever aims at it and whatever this function saw.
 *
 * DECISION: the human check is named and never attempted. Not a read into the
 * widget, not a click, not a solving service — the whole of the agent's
 * response to being asked to prove it is a person is to say who can answer
 * that. It could not do otherwise if it wanted to: a challenge is a
 * third-party document, and `RelayGate` refuses an opaque target because "an
 * unreadable target cannot be protected". What the model does with the sighting
 * is hand the window over, and the pause that opens survives — a window in
 * `user-drive` is refused retirement by `sandboxOf` in `runner-wiring.ts` and
 * is not reaped by `BrowserService`, so the half-filled basket is still there
 * when the shopper hands the wheel back.
 *
 * Order is the order the steps happen in on a real checkout — a shop checks
 * you are human, then that you are signed in, then it takes your money — so
 * the earliest step a page could be is named first.
 */
export function observeWindow(dom: PageDom): WindowObservation {
  const looks: WindowLook[] = [];
  const because: string[] = [];
  const note = (look: WindowLook, seen: Sighting | null): void => {
    if (seen === null) return;
    looks.push(look);
    because.push(`${seen.signal}: ${seen.detail}`);
  };
  note("human-check", challengeIn(dom));
  note("sign-in", signInPageIn(dom));
  note("payment", paymentPageIn(dom));
  return { looks_like: looks, because };
}
