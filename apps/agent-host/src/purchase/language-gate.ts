/**
 * Did the committed reply obey the language the shopper asked for?
 *
 * DECISION: a check at commit, not another sentence in a prompt. Four prompt
 * rewrites had already been tried — the rule in the system prompt, the rule
 * moved to the closing, the shopper's own line quoted verbatim at the point of
 * generation, and the app's picker passed end to end — and a measured battery
 * still answered eight English questions in Hindi, eight times out of eight.
 * An instruction the model reads and does not follow is not made binding by
 * being written again; it is made binding by the harness reading the answer.
 *
 * DECISION: character classes and a word list, never a language model and
 * never a detector. Nothing here decides what the shopper speaks — that is
 * still their picker, or their own line — and this file cannot express "answer
 * in X". All it can say is: they instructed something that is not Hindi, and
 * this reply is Hindi. It is deliberately one-directional. A shopper writing
 * Hindi is never told their agent replied wrongly, because romanised Hindi and
 * Devanagari are both correct answers to a Hindi line and no mechanical test
 * can rank them.
 */
const DEVANAGARI = /[ऀ-ॿ]/gu;

/**
 * Hindi function words as a shopper actually types them in Latin letters. This
 * is the same kind of list `task-features.ts` already routes on, kept here
 * because the two ask different questions — that one asks which model should
 * answer, this one asks whether the answer obeyed an instruction.
 */
const ROMANISED: readonly string[] = [
  "main",
  "maine",
  "mujhe",
  "aap",
  "aapko",
  "aapke",
  "apne",
  "hai",
  "hain",
  "hoon",
  "hun",
  "raha",
  "rahi",
  "rahe",
  "karna",
  "karo",
  "kar",
  "nahi",
  "nahin",
  "mein",
  "liye",
  "sabse",
  "sasta",
  "chahiye",
  "kitna",
  "dekh",
  "dikhao",
  "mila",
  "milta",
  "abhi",
  "phir",
  "dala",
  "paisa",
  "rupaye",
  "mere",
  "mera",
  "meri",
  "ek",
  "wala",
  "dhundho",
  "kharido",
  "batao",
  "thoda",
  "accha",
  "theek",
  "haan",
];

/**
 * Two floors, deliberately different. Accusing a reply needs three markers —
 * "main" and "kar" are ordinary English words and one coincidence must never
 * condemn a correct English answer. Deciding that the *shopper* wrote Hindi,
 * which only ever makes the gate stand down, needs two: their lines are short
 * ("Amazon par mere liye ek SSD dhundho"), and doubt resolves toward not
 * accusing.
 */
const COMMIT_FLOOR = 3;

const LINE_FLOOR = 2;

/** Enough Devanagari to be a quoted product name and no more. Above this, a
 *  reply to a Latin-script line was written in Hindi, whatever else is in it —
 *  the live failure this catches mixed Devanagari sentences with English
 *  product names and was majority-Latin by character count. */
const QUOTE_ALLOWANCE = 4;

function countOf(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function romanisedHits(text: string): number {
  const words = new Set(text.toLowerCase().match(/[a-z]+/gu) ?? []);
  return ROMANISED.filter((marker) => words.has(marker)).length;
}

/** More Devanagari than a quotation would need, or enough romanised Hindi
 *  function words that the sentence cannot be English by accident. */
export function readsHindi(text: string, floor: number = COMMIT_FLOOR): boolean {
  if (countOf(text, DEVANAGARI) > QUOTE_ALLOWANCE) {
    return true;
  }
  return romanisedHits(text) >= floor;
}

/** A language code the shopper picked that is not Hindi. `hi`, and anything
 *  the picker offers that is written in Devanagari, abstains. */
function picked(replyLanguage: string): boolean {
  const code = replyLanguage.toLowerCase().split(/[-_]/)[0] ?? "";
  return !["hi", "mr", "ne", "sa", "kok", "mai"].includes(code);
}

/**
 * What the shopper instructed, and whether this reply honoured it.
 *
 * `true` when there is nothing to enforce: they asked in Hindi, or they picked
 * a Devanagari language, and both scripts are then legitimate answers.
 */
export function obeys(
  told: string,
  replyLanguage: string | null,
  anchor: string,
): boolean {
  const wantsOther =
    replyLanguage === null
      ? !readsHindi(anchor, LINE_FLOOR)
      : picked(replyLanguage);
  return !wantsOther || !readsHindi(told);
}

/** Handed back to the model with the question it already answered. Naming the
 *  line again rather than naming a language keeps the rule where it has always
 *  been: the shopper decides, this only checks. */
export const CORRECTIVE =
  "That reply was written in Hindi. They did not write in Hindi and they did " +
  "not ask for it. Write the same answer again — same findings, same prices, " +
  "same pages, same recommendation — in the language of their own line quoted " +
  "below, and in no other. Say nothing about this correction.\n\n";

/** Said in the harness's own voice when a second attempt slipped too. The
 *  answer still stands: a shopper reading the right prices in the wrong
 *  language is better served than one reading nothing. */
export const LANGUAGE_SLIPPED =
  "That answer came back in a language you did not ask for. The findings and " +
  "the prices in it are the ones I read; the language is my mistake.";
