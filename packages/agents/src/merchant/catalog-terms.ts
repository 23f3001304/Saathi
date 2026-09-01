/**
 * Words that carry no product meaning. Without this list "under" and "from"
 * are query terms, and a two-letter token like "a" matches every row.
 */
const NOISE = new Set([
  "a",
  "an",
  "and",
  "any",
  "are",
  "at",
  "buy",
  "can",
  "find",
  "for",
  "from",
  "get",
  "give",
  "good",
  "have",
  "inr",
  "is",
  "it",
  "less",
  "like",
  "looking",
  "me",
  "merchant",
  "most",
  "my",
  "need",
  "new",
  "of",
  "one",
  "or",
  "order",
  "please",
  "rs",
  "rupees",
  "show",
  "some",
  "than",
  "that",
  "the",
  "then",
  "this",
  "to",
  "trust",
  "trusted",
  "under",
  "want",
  "which",
  "with",
  "you",
  "your",
]);

/**
 * English plurals and gerunds, only as far as this catalog needs: "shoes"
 * has to find "shoe" and "running" has to find "Run", or a buyer asking for
 * running shoes is told the shop has none.
 */
export function stems(token: string): readonly string[] {
  const forms = [token];
  if (token.endsWith("s")) forms.push(token.slice(0, -1));
  if (token.endsWith("es")) forms.push(token.slice(0, -2));
  if (token.endsWith("ing")) {
    const cut = token.slice(0, -3);
    forms.push(cut);
    if (cut.length > 2 && cut.at(-1) === cut.at(-2))
      forms.push(cut.slice(0, -1));
  }
  return forms.filter((form) => form.length >= 3);
}

export function terms(query: string): readonly string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !NOISE.has(token));
}

export function hits(haystack: string, query: string): number {
  return terms(query).filter((token) =>
    stems(token).some((form) => haystack.includes(form)),
  ).length;
}
