// `GET /v1/merchant/*` in the gateway's shape, turned into what the console
// reads. Every call asks `isLive()` first, exactly as api/gateway.ts does, so
// an unconfigured build never reaches for a server nobody started.
import { getJson, isLive } from "./gateway.ts";
import { fixtureDesk, fixtureItems } from "./merchantFixtures.ts";
import type {
  EnrolmentView,
  MerchantDeskView,
  MerchantItemView,
  ShelfView,
  StandingView,
  TrustTermView,
} from "./merchantTypes.ts";
import { TERM_LABELS } from "./merchantTypes.ts";

interface RawTerm {
  readonly term: string;
  readonly weight: number;
  readonly rate: number;
  readonly kept: number;
  readonly of: number;
}

interface RawCounters {
  readonly quotes_total: number;
  readonly quote_mismatches: number;
  readonly catalog_reads: number;
  readonly manipulation_attempts: number;
  readonly refunds_requested: number;
  readonly refunds_honored: number;
  readonly cooloff_cancellations: number;
  readonly carts_total: number;
}

export interface RawStanding {
  readonly merchant_id: string;
  readonly score: number;
  readonly observations: number;
  readonly priorPseudoCount: number;
  readonly priorScore: number;
  readonly contributions: readonly RawTerm[];
  readonly counters: RawCounters;
  readonly stock_conflicts: number;
}

interface RawDesk {
  readonly merchants: readonly RawStanding[];
  readonly standing?: RawStanding;
  readonly enrolled: readonly { issuer: string; kids: string[] }[];
}

interface RawItem {
  readonly item_id: string;
  readonly name: string;
  readonly description: string;
  readonly amount_paise: number;
  readonly currency: string;
  readonly active: boolean;
  readonly floor_paise?: number | null;
  readonly floor_list_paise?: number | null;
}

function termOf(raw: RawTerm): TrustTermView {
  return { ...raw, label: TERM_LABELS[raw.term] ?? raw.term };
}

export function standingOf(raw: RawStanding): StandingView {
  return {
    merchant: raw.merchant_id,
    score: raw.score,
    observations: raw.observations,
    priorPseudoCount: raw.priorPseudoCount,
    priorScore: raw.priorScore,
    contributions: raw.contributions.map(termOf),
    stockConflicts: raw.stock_conflicts,
    counters: {
      quotesTotal: raw.counters.quotes_total,
      quoteMismatches: raw.counters.quote_mismatches,
      catalogReads: raw.counters.catalog_reads,
      manipulationAttempts: raw.counters.manipulation_attempts,
      refundsRequested: raw.counters.refunds_requested,
      refundsHonored: raw.counters.refunds_honored,
      cooloffCancellations: raw.counters.cooloff_cancellations,
      cartsTotal: raw.counters.carts_total,
    },
  };
}

export function itemOf(raw: RawItem): MerchantItemView {
  return {
    itemId: raw.item_id,
    name: raw.name,
    description: raw.description,
    amountPaise: raw.amount_paise,
    currency: raw.currency,
    active: raw.active,
    floorPaise: raw.floor_paise ?? null,
    floorListPaise: raw.floor_list_paise ?? null,
  };
}

/** `?merchant=` is how every fold read says which shop it is about. */
function scoped(path: string, slug: string | null): string {
  return slug === null ? path : `${path}?merchant=${encodeURIComponent(slug)}`;
}

/**
 * The list of shops the running gateway pinned at boot. Read before sign-in
 * completes, because it is what decides which shops the console will open at
 * all — and it needs no identity, being the same public ring every quote is
 * verified against.
 */
export async function fetchEnrolled(): Promise<{
  enrolled: EnrolmentView[];
  live: boolean;
}> {
  if (!isLive()) {
    return { enrolled: fixtureDesk().enrolled, live: false };
  }
  const raw = await getJson<RawDesk>("/v1/merchant/standing");
  return { enrolled: raw.enrolled.map((entry) => ({ ...entry })), live: true };
}

export async function fetchMerchantDesk(
  slug: string | null,
): Promise<MerchantDeskView> {
  if (!isLive()) return fixtureDesk();
  const raw = await getJson<RawDesk>(scoped("/v1/merchant/standing", slug));
  const mine = raw.standing;
  return {
    merchants:
      mine === undefined ? raw.merchants.map(standingOf) : [standingOf(mine)],
    enrolled: raw.enrolled.map((entry) => ({ ...entry })),
    live: true,
  };
}

/**
 * A gateway with no Razorpay key answers 503 here, and that is the honest
 * answer — an unconfigured shelf is not an empty one. The console falls back
 * to fixtures and says which it is showing rather than presenting three made
 * up rows as a merchant's real inventory.
 */
export async function fetchShelf(): Promise<ShelfView> {
  if (!isLive()) return { items: fixtureItems(), live: false };
  try {
    const raw = await getJson<{ items: readonly RawItem[] }>(
      "/v1/merchant/items",
    );
    return { items: raw.items.map(itemOf), live: true };
  } catch {
    return { items: fixtureItems(), live: false };
  }
}
