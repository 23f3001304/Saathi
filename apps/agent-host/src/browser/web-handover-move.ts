import type { Handoff, HandoffReason } from "@covenant/browser-drive";

import type { WebProgress } from "./web-progress.js";
import type { WebResult } from "./web-result.js";
import { NO_WINDOW, webOk } from "./web-result.js";

/** The reasons the model may give, in its own vocabulary. `other` exists so a
 *  page nobody enumerated is still handable, rather than silently pressed. */
export type HandoverReason = "payment" | "sign-in" | "human-check" | "other";

/** What this move needs of a window: where it is, and who may pause it.
 *  Narrow on purpose - nothing reaches the page, the pointer or the keyboard
 *  through this shape, and `BrowserSession` satisfies it as it stands. */
export interface HandoverWindow {
  url(): string;
  handoff(): { raise(reason: HandoffReason, url: string): Handoff };
}

/**
 * The model's names, mapped to the session's own.
 *
 * DECISION: `HandoffReason` is a closed list in `browser-drive` - "a reason
 * nobody enumerated is a context nobody thought about" - and this table is the
 * only place the two vocabularies meet. `other` lands on `final-review`, the
 * session's name for "the agent has gone as far as it should and a person now
 * looks". It is not `payment`: that name tells `WebProgress.resumable` this is
 * the end of the road, and a handover nobody anticipated is a pause.
 */
const RAISES: Readonly<Record<HandoverReason, HandoffReason>> = {
  payment: "payment",
  "sign-in": "login",
  "human-check": "captcha",
  other: "final-review",
};

/**
 * The stop copy, word for word from when the host said it by itself: the
 * sentence the model repeats in the shopper's own language, saying how far the
 * agent got and that the rest is theirs. A reason with no copy speaks with the
 * model's own `why`; nothing here invents a sentence for one.
 */
const SAYS: Readonly<Partial<Record<HandoverReason, string>>> = {
  payment:
    "This is the payment step. I have taken it as far as I can: every field " +
    "and every button here is yours, and I have pressed nothing that pays. " +
    "The window is yours now.",
  "sign-in":
    "This shop wants you signed in before it will go any further. I never " +
    "type credentials, so the window is yours: sign in there and tell me " +
    "when you are through, and I will pick up in the same window; the basket " +
    "is still in it.",
  "human-check":
    "This shop is asking to check you are human. I cannot answer that for " +
    "you and I will not try: solving it is yours to do, by design. The " +
    "window is yours now: work through it there, and tell me when you are " +
    "through. Nothing is lost; I pick up in the same window where I stopped.",
};

/**
 * Handing the window to the shopper, as a move the model makes.
 *
 * DECISION: the host used to make this move for it, off a DOM reading, on
 * every read - and gave a product page away because it carried a Buy Now
 * button. Perception moved to the model (`observeWindow`); so does the
 * decision that follows from it. What did not move is the floor: this raises
 * the same handoff the automatic path raised, records the same fact in
 * `WebProgress`, and `FieldClassifier` still refuses a pay control whether or
 * not anyone called this first.
 */
export class HandoverMove {
  constructor(
    private readonly window: () => HandoverWindow | null,
    private readonly progress: WebProgress,
  ) {}

  /** `why` is the model's own sentence and is passed through untouched: it is
   *  what the shopper reads about a page only this errand saw. */
  raise(reason: HandoverReason, why: string): Promise<WebResult> {
    const window = this.window();
    if (window === null) return Promise.resolve(NO_WINDOW);
    const url = window.url();
    const raised = RAISES[reason];
    this.progress.recordHandover(raised);
    const handed = window.handoff().raise(raised, url);
    return Promise.resolve(
      webOk({
        handed_to_user: true,
        handoff_reason: handed.reason,
        reason,
        why,
        human: SAYS[reason] ?? why,
        url,
      }),
    );
  }
}
