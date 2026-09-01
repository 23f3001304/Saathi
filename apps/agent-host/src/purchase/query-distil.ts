import { cleanTitle } from "../browser/listing-identity.js";

/**
 * The thing to search for, out of everything the shopper has said.
 *
 * A run's errand query is the whole stated half of the conversation joined:
 * "Buy me a SSD\n1 TB internal\nFOR LAPTOP 20,000RS MAX\nOK". That string is
 * both the search seed typed into a shop's box *and* the overlap query that
 * decides which scraped tiles become cards — so "OK" and "please" are scoring
 * products, and a shop is being searched for a word the shopper used to agree
 * with something.
 *
 * DECISION: drop lines that carry no want, keep every line that does, in the
 * order they were said. Not a summary and not a model call: the shopper's own
 * words with the turn-taking taken out.
 */
const AGREEMENT: ReadonlySet<string> = new Set([
  "ok",
  "okay",
  "yes",
  "yeah",
  "yep",
  "sure",
  "fine",
  "please",
  "thanks",
  "go",
  "ahead",
  "do",
  "it",
  "that",
  "one",
  "haan",
  "theek",
  "accha",
  "karo",
  "chalo",
]);

function wordsOf(line: string): readonly string[] {
  return cleanTitle(line)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);
}

/** A line that is only agreement, or only punctuation, states no want. */
function states(line: string): boolean {
  const words = wordsOf(line);
  return words.length > 0 && words.some((word) => !AGREEMENT.has(word));
}

export function distilQuery(request: string): string {
  const kept = request
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => states(line));
  return kept.length > 0 ? kept.join(" ") : request.trim();
}
