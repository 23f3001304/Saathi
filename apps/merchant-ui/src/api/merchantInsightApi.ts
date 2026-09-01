// The reads that answer "why am I not being picked" — the listing audit,
// unmet demand, and the leakage the verdicts named. Split from merchantApi.ts
// so neither file is a grab bag.
import { getJson, isLive } from "./gateway.ts";
import {
  fixtureAudit,
  fixtureDemand,
  fixtureLeakage,
} from "./merchantFixtures.ts";
import { standingOf } from "./merchantApi.ts";
import type { RawStanding } from "./merchantApi.ts";
import type {
  DemandView,
  LeakageView,
  ListingAuditView,
  NegotiatedView,
} from "./merchantTypes.ts";

interface RawCue {
  readonly kind: string;
  readonly phrase: string;
  readonly bias: string;
  readonly counter: string;
}

interface RawAudit {
  readonly listings: readonly {
    item_id: string;
    name: string;
    cues: readonly RawCue[];
  }[];
  readonly by_kind: Record<string, number>;
  readonly clean: number;
}

function auditOf(raw: RawAudit): ListingAuditView {
  return {
    live: true,
    clean: raw.clean,
    byKind: raw.by_kind,
    listings: raw.listings.map((listing) => ({
      itemId: listing.item_id,
      name: listing.name,
      cues: listing.cues.map((cue) => ({ ...cue })),
    })),
  };
}

/**
 * The listing audit is the sharpest thing on this dashboard and the one most
 * tempting to fake, so it degrades the same way the shelf does: a gateway with
 * no Razorpay key has no copy to read, and the console shows fixture findings
 * under a fixture label rather than an empty all-clear.
 */
export async function fetchListingAudit(): Promise<ListingAuditView> {
  if (!isLive()) return fixtureAudit();
  try {
    return auditOf(await getJson<RawAudit>("/v1/merchant/listings/audit"));
  } catch {
    return fixtureAudit();
  }
}

/**
 * Copy that is not an item yet, audited by the same detector on the same
 * server. The editor calls this while the merchant types, so the finding shown
 * beside the field is the finding a buyer agent will make — not a browser-side
 * approximation of one, which would be the second opinion this panel exists to
 * not be.
 */
export async function fetchDraftAudit(
  name: string,
  description: string,
): Promise<ListingAuditView | null> {
  if (!isLive()) return null;
  const query = new URLSearchParams({ name, description });
  try {
    return auditOf(
      await getJson<RawAudit>(
        `/v1/merchant/listings/draft-audit?${query.toString()}`,
      ),
    );
  } catch {
    return null;
  }
}

interface RawDemand {
  readonly unmet: readonly { query: string; asks: number; last_at: string }[];
}

function scoped(path: string, slug: string | null): string {
  return slug === null ? path : `${path}?merchant=${encodeURIComponent(slug)}`;
}

export async function fetchDemand(slug: string | null): Promise<DemandView> {
  if (!isLive()) return fixtureDemand();
  const raw = await getJson<RawDemand>(scoped("/v1/merchant/demand", slug));
  return {
    live: true,
    unmet: raw.unmet.map((ask) => ({
      query: ask.query,
      asks: ask.asks,
      lastAt: ask.last_at,
    })),
  };
}

interface RawSettled {
  readonly sku_id: string;
  readonly carts: number;
  readonly cleared_floor: number;
  readonly saved_paise: number;
  readonly floor_paise: number;
  readonly list_paise: number;
  readonly last_at: string;
}

interface RawNegotiated {
  readonly settled: readonly RawSettled[];
  readonly window_days: number;
}

/**
 * What the shop's floors won. Unlike `fetchDemand` this degrades to an empty
 * week rather than throwing: a console with no gateway has not learned that
 * nothing settled, and an empty list says exactly that in the panel's own
 * words.
 */
export async function fetchNegotiated(
  slug: string | null,
): Promise<NegotiatedView> {
  if (!isLive()) return { settled: [], windowDays: 7, live: false };
  try {
    const raw = await getJson<RawNegotiated>(
      scoped("/v1/merchant/negotiated", slug),
    );
    return {
      live: true,
      windowDays: raw.window_days,
      settled: raw.settled.map((row) => ({
        skuId: row.sku_id,
        carts: row.carts,
        clearedFloor: row.cleared_floor,
        savedPaise: row.saved_paise,
        floorPaise: row.floor_paise,
        listPaise: row.list_paise,
        lastAt: row.last_at,
      })),
    };
  } catch {
    return { settled: [], windowDays: 7, live: false };
  }
}

interface RawLeakage {
  readonly standing: RawStanding;
  readonly refusals: readonly { reason_code: string; count: number }[];
}

export async function fetchLeakage(slug: string | null): Promise<LeakageView> {
  if (!isLive()) return fixtureLeakage();
  const raw = await getJson<RawLeakage>(scoped("/v1/merchant/leakage", slug));
  const standing = standingOf(raw.standing);
  return {
    live: true,
    counters: standing.counters,
    stockConflicts: standing.stockConflicts,
    refusals: raw.refusals.map((row) => ({
      reasonCode: row.reason_code,
      count: row.count,
    })),
  };
}
