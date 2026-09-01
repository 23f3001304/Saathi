/**
 * How long an ordinary turn is allowed to be, and what it may not re-say.
 *
 * DECISION: two rules, two places, because they fail in two places. Length is
 * a property of the plan's own prose and is checked where the plan is
 * committed. Restating the cards is only possible for a turn that has *seen*
 * rows — which, on this harness, is only the purchase conversation: the browse
 * move is handed a count and never the listings, so it cannot re-read a table
 * it was never shown. That check therefore lives at `RunNarrator.replay`,
 * beside the listings it is about.
 *
 * DECISION: the research summary is exempt from the length rule and only from
 * that one. Its reasoning is the deliverable — which of three drives is worth
 * the extra ₹4,500 cannot be said in two sentences — and the ban on restating
 * card rows still binds it, because reasoning *about* a product is not reading
 * the row out. `web-summary.ts` gates its own commit and does not call this.
 */
export const MAX_SENTENCES = 2;

/** Terminators that actually end a sentence: one followed by whitespace or the
 *  end of the text. `₹1,299` and `4.5/5` keep their full stops. */
const TERMINATOR = /[.!?…]+(?=\s|$)/gu;

/** Non-global on purpose: `TERMINATOR` carries a `lastIndex`, and a `.test`
 *  against it would answer differently on every other call. */
const ENDS_TERMINATED = /[.!?…]$/u;

export function sentenceCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const ended = trimmed.match(TERMINATOR)?.length ?? 0;
  // Text after the last terminator is a sentence too, terminated or not.
  return ENDS_TERMINATED.test(trimmed) ? Math.max(ended, 1) : ended + 1;
}

export function overlong(text: string): boolean {
  return sentenceCount(text) > MAX_SENTENCES;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The sentence reads a card row back out. Matching is on the whole normalised
 * label, so a reply that merely *names* one option — "the SanDisk Extreme is
 * the one I would buy" — is untouched; what this catches is the row copied
 * across, "Kolam Run Gc9 road shoe, UK 8 — ₹1,999", directly above the card
 * printing the same thing.
 */
export function restatesRow(text: string, labels: readonly string[]): boolean {
  const said = normalise(text);
  return labels.some((label) => {
    const row = normalise(label);
    return row.length > 0 && said.includes(row);
  });
}

/** Handed back with the turn it is about. It names the fault and not a length:
 *  "two sentences" is a rule about saying one thing, not a word budget to pad
 *  up to. */
export const REGISTER_CORRECTIVE =
  "That reply said more than one thing. Say what you are about to do, or what " +
  "you just found, and stop: two sentences at the outside, and the question " +
  "counts as one of them. Do not restate anything already on their screen: " +
  "the cards, the cart, the sheet they are about to sign. Answer the whole " +
  "turn again, shorter.\n\n";
