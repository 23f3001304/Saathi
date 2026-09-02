import type { CatalogSku } from "@covenant/agents";

/**
 * The scripted fake model's reading of a sentence against the shelf. Live
 * mode never runs this: the model reads the shelf through `see_shelf` and
 * names skus. Scripted mode has no model, so the script decides here, and
 * the rules below are the script's, not the shell's.
 */

function mentions(text: string, needle: string): boolean {
  return needle.length > 0 && text.includes(needle.toLowerCase());
}

/** Words that say how the shopper is asking, not what they are asking for. */
const STOP_WORDS: ReadonlySet<string> = new Set([
  "under",
  "with",
  "that",
  "this",
  "please",
  "need",
  "want",
  "some",
  "from",
  "find",
  "show",
  "buy",
  "the",
  "and",
  "for",
]);

/** Plural and singular are the same want: "running shoes" must reach "shoe". */
function stem(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/**
 * Punctuation is not part of a word. Splitting on whitespace alone left
 * `"shoe,"` in the label's token list, which matched nothing a shopper ever
 * types — so a request for running shoes scored zero against every shoe and
 * fell through to the cheapest thing in the catalog.
 */
function tokensOf(text: string): ReadonlySet<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
      .map(stem),
  );
}

function scoreOf(item: CatalogSku, wanted: ReadonlySet<string>): number {
  const words = tokensOf(`${item.label} ${item.category}`);
  return [...words].filter((word) => wanted.has(word)).length;
}

/**
 * Best word overlap first, price breaking the tie — because a fiduciary's
 * default is the cheaper option, not the first one the merchant happened to
 * return. Ordering only: see `matchCatalog` for what is a match at all.
 */
function rankCatalog(
  catalog: readonly CatalogSku[],
  request: string,
): readonly CatalogSku[] {
  const wanted = tokensOf(request);
  return [...catalog].sort((left, right) => {
    const byScore = scoreOf(right, wanted) - scoreOf(left, wanted);
    return byScore !== 0 ? byScore : left.listPricePaise - right.listPricePaise;
  });
}

/**
 * Only what actually matches. `rankCatalog` sorts and never filters, which is
 * right when something must be chosen and catastrophic when nothing should be:
 * a browse for "ssd" came back sorted — socks, then kurtas — and the agent read
 * it out as though the shop stocked them.
 *
 * DECISION: the best-scoring rows, not every row sharing a word. One token of
 * overlap was a match, so "navy cotton kurta" returned a cotton-silk stole
 * beside the kurta — and the agent, shown two rows, told the shopper this shop
 * had "two matching navy cotton kurtas" and asked which one they wanted. A
 * coincidence of vocabulary is not a match. Rows that tie at the top all
 * survive, so the three-merchant comparison the demo rests on is untouched.
 */
export function matchCatalog(
  catalog: readonly CatalogSku[],
  request: string,
): readonly CatalogSku[] {
  const wanted = tokensOf(request);
  const ranked = rankCatalog(catalog, request);
  const best = Math.max(0, ...ranked.map((item) => scoreOf(item, wanted)));
  return best === 0
    ? []
    : ranked.filter((item) => scoreOf(item, wanted) === best);
}

/**
 * The shop sells nothing the shopper asked for.
 *
 * Named, because it is a refusal and not a fault. A caller that can answer the
 * shopper should catch this and say so — the turn is simply not a purchase —
 * and `request` is carried so that answer can be about what was asked for.
 */
export class NothingStocked extends Error {
  constructor(readonly request: string) {
    super("this shop stocks nothing matching the request");
    this.name = "NothingStocked";
  }
}

/**
 * The listing the shopper actually asked for, or nothing.
 *
 * `null` is the whole point. The choice used to be `rankCatalog(...)[0]` — the
 * nearest row, and on a total miss the *cheapest* one — so "do you have a 1tb
 * ssd" reached the drafter as a three-pack of socks, and a human was asked to
 * sign a mandate for apparel over a storage request. A draft names something
 * the shopper asked for, or there is no draft.
 *
 * An explicit SKU code in the request still wins outright, ahead of the
 * matcher: that is a user naming a thing, and it is also how the T-1 run asks
 * for the poisoned listing.
 */
export function matchedSku(
  catalog: readonly CatalogSku[],
  request: string,
): CatalogSku | null {
  const text = request.toLowerCase();
  const named = catalog.find((item) => mentions(text, item.sku.toLowerCase()));
  return named ?? matchCatalog(catalog, request)[0] ?? null;
}

/** The same choice for a caller that must have one, refusing rather than
 *  reaching for the nearest row when the shop has nothing. */
export function chooseSku(
  catalog: readonly CatalogSku[],
  request: string,
): CatalogSku {
  const chosen = matchedSku(catalog, request);
  if (chosen === null) {
    throw new NothingStocked(request);
  }
  return chosen;
}
