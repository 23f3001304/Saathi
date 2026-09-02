import type { ToolOutcome } from "../shared/agent-session.js";

/** What the model is told once the cards it named are on the screen: the
 *  `reply` it wrote was written before the cards went out, and the cards are
 *  built from the shelf rows for exactly the skus it named. Guidance in a
 *  tool result, not a rule in the harness. */
const SOMETHING_SHOWN =
  "The cards for the skus you named are on their screen, with the shop's " +
  "own prices. Do not list them again; say what you make of them, in one " +
  "sentence, or say nothing.";

/**
 * What an answer turn did: nothing. No page was opened and no catalog was
 * searched, and the result says so in those words.
 *
 * DECISION: a statement of fact, not an instruction. The first version of this
 * told the model to "look instead", and a small model read that as an account
 * of what had happened and wrote "I've pulled Amazon results for a 1TB SSD
 * under 50,000" over a turn that opened nothing — a worse failure than the
 * question it was meant to replace. What the model may safely say follows from
 * what the turn actually did, so the turn says what it did.
 */
const OPENED_NOTHING =
  "This move opened no page and searched nothing, so you have no results and " +
  "have not looked anywhere. Do not tell them otherwise. If you need to see " +
  "something before you can answer, call see_shelf for this shop or " +
  "look_on_web for anywhere else; that is what actually goes and looks.";

/**
 * `blocked_by` makes the model name the one thing looking could not have told
 * it. Leaving it empty is answered, never refused: the model may still change
 * its mind, and the last move it records is the one that runs.
 */
export function answeredOutcome(blocking: string): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: true,
      recorded: "answer",
      opened_nothing: true,
      named_a_blocker: blocking.length > 0,
      note: OPENED_NOTHING,
    }),
    isError: false,
  };
}

/** How many cards went out for the skus the model named. The note is true
 *  unconditionally now: the host cards exactly those skus, so there is no
 *  case where the model was shown nothing it asked for. */
export function browsedOutcome(shown: number): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: true,
      recorded: "browse",
      shown,
      note: SOMETHING_SHOWN,
    }),
    isError: false,
  };
}
