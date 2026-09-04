import type { Logger } from "@covenant/domain";

import { knownBlock } from "./context-digest.js";
import type { ContextView } from "./context-record.js";
import type { PageIndex } from "./page-index.js";
import { seenBlock, SEEN_SHOWN } from "./seen-block.js";
import { errandFor } from "./web-errand.js";

export interface BriefParts {
  readonly currency: string;
  readonly logger: Logger;
  /** This conversation's own finds. */
  readonly context: ContextView | null;
  /** Pages any earlier errand on this host opened. */
  readonly pages: PageIndex | null;
}

/**
 * The whole errand prompt: the ask, the market, their own words, and the
 * ground already covered.
 *
 * Its own file because it is text rather than orchestration - `WebLookStep`
 * runs an errand and this decides what the errand is told, and the two were
 * only ever together because one called the other.
 */
export function lookBrief(
  parts: BriefParts,
  query: string,
  asked: readonly string[],
  replyLanguage: string | null,
): string {
  const look = errandFor(
    query,
    asked,
    parts.currency,
    replyLanguage,
    groundCovered(parts, query),
  );
  parts.logger.debug("chat.reply_language", {
    at: "web_look",
    reply_language: replyLanguage,
    errand: look,
  });
  return look;
}

/**
 * This conversation's own finds first, then pages any earlier errand on this
 * host opened for a similar ask. Theirs come first because they are what THEY
 * were shown; the host's are a head start, and the block says so.
 */
function groundCovered(parts: BriefParts, query: string): string {
  const mine = knownBlock(parts.context?.current() ?? null);
  const seen = seenBlock(parts.pages?.recall(query, SEEN_SHOWN) ?? []);
  return `${mine}${seen}`;
}
