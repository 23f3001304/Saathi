import type { PageListing } from "@covenant/browser-drive";

import type { WebListingView } from "../browser/web-listing.js";
import { cleanTitle, productKey } from "../browser/listing-identity.js";

/**
 * One conversation's working state, as the shell recorded it.
 *
 * DECISION: written only from what the harness itself observed — the cards it
 * carded, the park it holds, the slots it typed into — never from the model's
 * prose. The two exceptions are marked where they stand: `summary` is a lossy
 * compaction of dialogue and `outcome.said` is the sentence that was actually
 * committed to the shopper's screen. Both are records *of dialogue*, and
 * neither may justify a money-shaped step: nothing reads them but a prompt's
 * data block.
 *
 * DECISION: every string that came off a page — titles, prices, URLs — is an
 * injection channel, so this record never leaves the data sections of the
 * prompts it feeds (`TURN_PLAN_CONTEXT_MARK`, the errand's ALREADY FOUND
 * block). It cannot widen a covenant and it writes no PTLM tier: it is filed
 * beside the beat log, in the host's own table, not in memory the cart binds.
 */
export interface ContextOption {
  readonly ref: string;
  /** The cleaned title — the name, with the shop's decoration taken off. */
  readonly title: string;
  readonly priceText: string;
  readonly url: string;
  /** The shop's own id for the product, where its URL carries one. */
  readonly productKey: string | null;
  readonly imageUrl: string | null;
}

export interface ContextPick {
  readonly ref: string;
  readonly title: string;
  readonly url: string;
}

/** Where a checkout stood when the run ended, from `WebPickPark`/`WebProgress`:
 *  parked on this host's own address question, parked at a door only the
 *  shopper can open, or ended at the payment step that is theirs to take. */
export type ContextStop = "address" | "handback" | "code" | "payment";

export interface ContextProgress {
  /** This host clicked an add-to-basket control and the page settled. */
  readonly carted: boolean;
  /** Delivery-form slot names this host typed into. Names, never values. */
  readonly filled: readonly string[];
  readonly stopped: ContextStop | null;
}

export interface ContextOutcome {
  /** The run's own status plus the beat detail — harness facts. */
  readonly state: string;
  /** The last committed line of the turn. Dialogue, never authority. */
  readonly said: string | null;
}

export interface WorkingContext {
  readonly v: 1;
  /** What they are after, distilled from their own lines by the shell. */
  readonly asked: string | null;
  readonly options: readonly ContextOption[];
  readonly pick: ContextPick | null;
  readonly progress: ContextProgress | null;
  readonly outcome: ContextOutcome | null;
  /** Compacted older dialogue — see `dialogue-compaction.ts`. */
  readonly summary: string | null;
  /** The instant of the newest line folded into `summary`. */
  readonly folded: string | null;
}

export function optionOf(listing: WebListingView): ContextOption {
  return {
    ref: listing.ref,
    title: cleanTitle(listing.title),
    priceText: listing.price_text,
    url: listing.url,
    productKey: productKey(listing.url),
    imageUrl: listing.image_url,
  };
}

/** A stored option as the page reader would have delivered it, so a restart
 *  re-mints refs through the same `WebFindings` path a live read uses. */
export function seedOf(option: ContextOption): PageListing {
  return {
    title: option.title,
    priceText: option.priceText,
    href: option.url,
    imageUrl: option.imageUrl,
  };
}

/** Enough structure to trust the row; anything else is an old schema and an
 *  empty record is the honest reading of one. */
export function parseContext(json: string | null): WorkingContext | null {
  if (json === null) return null;
  try {
    const raw = JSON.parse(json) as Partial<WorkingContext>;
    return raw.v === 1 && Array.isArray(raw.options)
      ? (raw as WorkingContext)
      : null;
  } catch {
    return null;
  }
}
