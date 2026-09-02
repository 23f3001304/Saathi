import type { ToolOutcome } from "../shared/agent-session.js";

const BROWSED_NOTE =
  "The host puts this shop's matching items, if any, on their screen as " +
  "cards after this turn. Do not list rows; say what you make of what you " +
  "asked for, once, or say nothing. If nothing fits they see no cards, so " +
  "when you are not sure what this shop holds, ask them or call " +
  "look_on_web if they want it found elsewhere.";

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
  "something before you can answer, call browse_catalog for this shop or " +
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

/** The move is recorded; what the shop holds is the model's to read through
 *  its own tools, never a number the harness counted for it. */
export function browsedOutcome(): ToolOutcome {
  return {
    content: JSON.stringify({
      ok: true,
      recorded: "browse",
      note: BROWSED_NOTE,
    }),
    isError: false,
  };
}
