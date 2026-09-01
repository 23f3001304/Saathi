import type { CatalogSku } from "@covenant/agents";

import { matchCatalog } from "./catalog-match.js";

const WORDS: ReadonlyMap<string, number> = new Map([
  ["no", 0],
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
]);

/** Words after which a number is a price, a size or a ceiling — never stock. */
const MEASURES: ReadonlySet<string> = new Set([
  "below",
  "cm",
  "eu",
  "inr",
  "mm",
  "most",
  "only",
  "rs",
  "size",
  "than",
  "to",
  "under",
  "up",
  "us",
  "uk",
]);

/** Nouns that make a number a quantity inside one listing: "3 pack", "2 pair". */
const UNITS: ReadonlySet<string> = new Set([
  "box",
  "pack",
  "pair",
  "piece",
  "set",
  "size",
  "unit",
]);

const PHRASE_WORDS = 4;

function bare(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
}

/** A standalone count, or `null`. An inner separator means the number belongs
 *  to a larger token — `1,299` is a price and `3-pack` is one listing. */
function countOf(word: string): number | null {
  const token = bare(word);
  if (/[^\p{L}\p{N}]/u.test(token)) {
    return null;
  }
  const named = WORDS.get(token);
  if (named !== undefined) {
    return named;
  }
  return /^\d{1,2}$/.test(token) ? Number(token) : null;
}

function counting(previous: string, next: string): boolean {
  return !MEASURES.has(bare(previous)) && !UNITS.has(bare(next));
}

/** The words the number was about, to the end of the clause. */
function phraseAfter(words: readonly string[], from: number): string {
  const taken: string[] = [];
  for (const word of words.slice(from, from + PHRASE_WORDS)) {
    taken.push(bare(word));
    if (/[.,;:!?]$/.test(word)) {
      break;
    }
  }
  return taken.join(" ");
}

interface ShelfCount {
  readonly claimed: number;
  readonly phrase: string;
}

function claimsIn(text: string): readonly ShelfCount[] {
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  const found: ShelfCount[] = [];
  words.forEach((word, index) => {
    const claimed = countOf(word);
    const next = words[index + 1] ?? "";
    if (
      claimed === null ||
      next === "" ||
      !counting(words[index - 1] ?? "", next)
    ) {
      return;
    }
    found.push({ claimed, phrase: phraseAfter(words, index + 1) });
  });
  return found;
}

/**
 * Whether a sentence counts this shop wrongly.
 *
 * The shelf is a record, and a sentence about how much of it matches something
 * is checkable against it — by the same matcher that decides what the shopper
 * is shown, so the answer and the cards cannot disagree. A live turn read the
 * shelf correctly (two items, one of them a kurta) and then told the shopper
 * there were "two matching navy cotton kurtas in size M; which one should I
 * prepare?". There is one. The agent's account of itself is not evidence; this
 * is the same rule the open-web report already lives under.
 *
 * Deliberately narrow. A count is only checked when the words after it name
 * something this shelf actually stocks — a phrase matching nothing is a claim
 * about something else, and guessing at it would suppress true sentences.
 */
export function miscountsShelf(
  shelf: readonly CatalogSku[],
  text: string,
): boolean {
  return claimsIn(text).some((claim) => {
    const found = matchCatalog(shelf, claim.phrase).length;
    return found > 0 && found !== claim.claimed;
  });
}
