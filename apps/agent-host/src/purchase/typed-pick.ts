import type { IdGenerator, Logger } from "@covenant/domain";

import type { WebListingView } from "../browser/web-listing.js";
import { cleanTitle } from "../browser/listing-identity.js";
import type { BeatHub } from "../http/beat-hub.js";
import { requestOverlap } from "../judge/catalog-match.js";
import { askTurn } from "./ask-step.js";
import type { PurchaseResult } from "./purchase-result.js";
import type { WebPickResume } from "./turn-step.js";
import type { WebOffered } from "./web-offered.js";

/**
 * The shopper naming one of the cards on the table, in words.
 *
 * DECISION: decided by the shell, before the planner sees the sentence. A live
 * run found and carded specific drives, the shopper typed "go with crucial
 * E100", and the turn went to the planner, came back `browse`, said "this shop
 * stocks nothing like that", and opened a *fresh* web errand that wandered onto
 * Amazon's home page. Every one of those steps was reasonable in isolation and
 * the whole was absurd: the thing they named was already on their screen, with
 * a ref and a URL this host had read. Tapping the card and typing its name are
 * the same act, and only one of them was being honoured.
 *
 * DECISION: only *discriminating* words count — those carried by some of the
 * offered titles but not all of them. "SSD" is in every card of an SSD search,
 * so "get me another SSD" names nothing and falls through to the planner as it
 * should. "Crucial" is in two of four, "E100" in one: those choose.
 */
export interface TypedPick {
  /** The one card they named. */
  readonly ref: string | null;
  /** More than one card fits the words they used, so the shell asks rather
   *  than guessing which product to spend their time on. */
  readonly between: readonly WebListingView[];
}

function tokensOf(text: string): ReadonlySet<string> {
  return new Set(
    cleanTitle(text)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1),
  );
}

/** Words that tell these cards apart: in at least one title, and not in all.
 *  A set of exact tokens: substring matching let "in" match "kingston" and
 *  turned ordinary sentences into spurious picks. */
function discriminating(offered: readonly WebListingView[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const listing of offered) {
    for (const word of tokensOf(listing.title)) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts]
      .filter(([, seen]) => seen < offered.length)
      .map(([word]) => word),
  );
}

function scoredBy(
  message: string,
  offered: readonly WebListingView[],
): readonly { readonly listing: WebListingView; readonly score: number }[] {
  const words = discriminating(offered);
  const asked = [...tokensOf(message)].filter((word) => words.has(word));
  const query = asked.join(" ");
  return offered.map((listing) => ({
    listing,
    score: query === "" ? 0 : requestOverlap(cleanTitle(listing.title), query),
  }));
}

/**
 * `null` when the sentence names no card and belongs to the planner — which is
 * every sentence, until an option set is on the table.
 */
export function typedPick(
  message: string,
  offered: readonly WebListingView[],
): TypedPick | null {
  if (offered.length < 2) return null;
  const scored = scoredBy(message, offered);
  const best = Math.max(0, ...scored.map((row) => row.score));
  if (best === 0) return null;
  const winners = scored.filter((row) => row.score === best);
  const chosen = winners[0];
  if (winners.length === 1 && chosen !== undefined) {
    return { ref: chosen.listing.ref, between: [] };
  }
  return { ref: null, between: winners.map((row) => row.listing) };
}

/** What the shell asks when their words fit more than one card. Their own
 *  titles are the chips, so answering is a tap. */
export const WHICH_ONE = "Which of those do you mean?";

export function chipsFor(between: readonly WebListingView[]): readonly string[] {
  return between.slice(0, 4).map((listing) => {
    const name = cleanTitle(listing.title);
    return name.length > 40 ? `${name.slice(0, 40).trimEnd()}…` : name;
  });
}

/**
 * The shell honouring a pick it can resolve itself.
 *
 * `null` means this sentence is not a pick and belongs to the planner, which is
 * the answer for every sentence until a set of cards is on the table.
 */
export interface PickParts {
  readonly hub: BeatHub;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly offered: WebOffered;
  readonly webPick: WebPickResume;
}

export async function routeTypedPick(
  parts: PickParts,
  base: PurchaseResult,
  message: string,
  turn: {
    chat: string | null;
    replyLanguage: string | null;
    /** The shopper's whole half of the conversation. The errand behind the
     *  pick reads its language and its context off this: handed only the
     *  picking sentence, a checkout for a thread's worth of stated wants knew
     *  nothing but "go with the Crucial". */
    stated?: readonly string[];
  },
): Promise<PurchaseResult | null> {
  // A checkout already standing on a question owns the next sentence: their
  // "yes" is an answer to the address, not a fresh product to go and buy.
  if (parts.webPick.parked) return null;
  const named = typedPick(message, parts.offered.live(turn.chat));
  if (named === null) return null;
  if (named.ref === null) {
    parts.logger.info("purchase.typed_pick.ambiguous", {
      between: named.between.length,
    });
    return askTurn(parts, base, WHICH_ONE, chipsFor(named.between));
  }
  parts.logger.info("purchase.typed_pick", { ref: named.ref });
  const stated = turn.stated ?? [message];
  return await parts.webPick.buy(named.ref, stated, turn.replyLanguage);
}
