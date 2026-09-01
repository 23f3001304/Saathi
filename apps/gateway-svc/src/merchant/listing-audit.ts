import type { MerchantItem } from "@covenant/domain";
import type { ManipulationKind } from "@covenant/memory";
import { detectAcross } from "@covenant/memory";

export interface AuditedCue {
  readonly kind: ManipulationKind;
  readonly phrase: string;
  readonly bias: string;
  readonly counter: string;
}

export interface AuditedListing {
  readonly item_id: string;
  readonly name: string;
  readonly cues: readonly AuditedCue[];
}

export interface ListingAudit {
  readonly listings: readonly AuditedListing[];
  readonly by_kind: Readonly<Partial<Record<ManipulationKind, number>>>;
  readonly clean: number;
}

/**
 * The merchant's own copy, read the way a buyer agent reads it.
 *
 * The detector is the same deterministic one the buyer runs — same regexes,
 * same eight named patterns, same counters — so this is not a second opinion
 * about the listings, it is literally the finding the buyer will make. That is
 * the point: a shop can see, before an agent does, that its "only 2 left" is
 * being read as a scarcity cue and priced accordingly.
 *
 * Title and description are audited together. A shop that keeps its scarcity
 * copy in one field and its fees in the other is running two patterns, not
 * none.
 */
export function auditListings(items: readonly MerchantItem[]): ListingAudit {
  return auditOf(
    items.map((item) => ({
      itemId: item.itemId,
      copy: [item.name, item.description],
    })),
  );
}

/**
 * The same detector over copy that is not an item yet. A merchant typing
 * "Only 2 left" into the listing editor is told what a buyer agent will read
 * before they save it, and it must be the finding the buyer will actually
 * make rather than a preview approximating one — so it runs here, once, and
 * the browser never carries a second copy of the patterns.
 */
export function auditCopy(name: string, description: string): ListingAudit {
  return auditOf([{ itemId: "draft", copy: [name, description] }]);
}

function auditOf(
  drafts: readonly { itemId: string; copy: readonly string[] }[],
): ListingAudit {
  const listings = drafts.map((draft) => ({
    item_id: draft.itemId,
    name: draft.copy[0] ?? "",
    cues: detectAcross(draft.copy).cues.map((cue) => ({ ...cue })),
  }));
  return {
    listings,
    by_kind: tally(listings),
    clean: listings.filter((listing) => listing.cues.length === 0).length,
  };
}

function tally(
  listings: readonly AuditedListing[],
): Partial<Record<ManipulationKind, number>> {
  const counts: Partial<Record<ManipulationKind, number>> = {};
  for (const listing of listings) {
    for (const cue of listing.cues) {
      counts[cue.kind] = (counts[cue.kind] ?? 0) + 1;
    }
  }
  return counts;
}
