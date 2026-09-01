// The merchant console's offline floor. Labelled as fixtures wherever it is
// shown: an unconfigured build must look calm and honest, never like a live
// shop that happens to be empty.
import type {
  CueView,
  DemandView,
  LeakageView,
  ListingAuditView,
  MerchantDeskView,
  MerchantItemView,
  StandingView,
  TrustTermView,
} from "./merchantTypes.ts";
import { TERM_LABELS } from "./merchantTypes.ts";

function term(
  name: string,
  weight: number,
  rate: number,
  kept: number,
  of: number,
): TrustTermView {
  return {
    term: name,
    label: TERM_LABELS[name] ?? name,
    weight,
    rate,
    kept,
    of,
  };
}

export const FIXTURE_MERCHANT = "kolam-run";

export function fixtureItems(): MerchantItemView[] {
  return [
    {
      itemId: "item_fixture_kurta",
      name: "Navy cotton kurta, M",
      description:
        "Handloom cotton in indigo. Full sleeve, side slits.\n\nProduct page: https://kolam-run.example/navy-cotton-kurta",
      amountPaise: 129900,
      currency: "INR",
      active: true,
      floorPaise: 119900,
      floorListPaise: 129900,
    },
    {
      itemId: "item_fixture_road",
      name: "Kolam Run Gc9 road shoe, UK 8",
      description:
        "Only 2 left at 60% off. Everyday road trainer with an 8 mm drop.\n\nProduct page: https://kolam-run.example/gc9-road",
      amountPaise: 199900,
      currency: "INR",
      active: true,
      floorPaise: null,
      floorListPaise: null,
    },
    {
      itemId: "item_fixture_socks",
      name: "Kolam Run cushioned socks, 3 pack",
      description: "Merino-blend crew socks. Machine washable.",
      amountPaise: 49900,
      currency: "INR",
      active: false,
      floorPaise: null,
      floorListPaise: null,
    },
  ];
}

function standing(): StandingView {
  return {
    merchant: FIXTURE_MERCHANT,
    score: 0.86,
    observations: 59,
    priorPseudoCount: 5,
    priorScore: 0.5,
    contributions: [
      term("quote_match", 0.6, 0.95, 39, 41),
      term("clean_channel", 0.25, 0.94, 17, 18),
      term("refunds_honoured", 0.15, 1, 3, 3),
    ],
    counters: {
      quotesTotal: 41,
      quoteMismatches: 2,
      catalogReads: 18,
      manipulationAttempts: 1,
      refundsRequested: 3,
      refundsHonored: 3,
      cooloffCancellations: 4,
      cartsTotal: 44,
    },
    stockConflicts: 2,
  };
}

export function fixtureDesk(): MerchantDeskView {
  return {
    merchants: [standing()],
    enrolled: [
      {
        issuer: "urn:covenant:merchant:kolam-run",
        kids: ["merchant-2026-08-479bb8bf"],
      },
    ],
    live: false,
  };
}

const SCARCITY: CueView = {
  kind: "scarcity",
  phrase: "Only 2 left",
  bias: "Loss aversion: a thing about to be unavailable feels more valuable.",
  counter:
    "Stock claims are untrusted text: an agent only believes a count when you sign a quote that holds one.",
};

const ANCHOR: CueView = {
  kind: "false_anchor",
  phrase: "60% off",
  bias: "Anchoring: the first number seen sets what every other number means.",
  counter:
    "A discount is measured against what the thing actually sold for, not against a number you struck through.",
};

const OBSTRUCTION: CueView = {
  kind: "obstruction",
  phrase: "no returns",
  bias: "Friction: what is hard to find is treated as though it did not exist.",
  counter:
    "Returns are something the buyer signed for. If your listing does not say it is returnable, the sale does not happen.",
};

/**
 * What the real detector finds in the demo shop's own copy: a scarcity line
 * and an anchor in one listing, a returns clause in another, one listing
 * clean. Written out rather than computed so the fixture floor needs no
 * import from a package this app does not depend on.
 */
export function fixtureAudit(): ListingAuditView {
  return {
    live: false,
    clean: 1,
    byKind: { scarcity: 1, false_anchor: 1, obstruction: 1 },
    listings: [
      { itemId: "item_fixture_kurta", name: "Navy cotton kurta, M", cues: [] },
      {
        itemId: "item_fixture_road",
        name: "Kolam Run Gc9 road shoe, UK 8",
        cues: [SCARCITY, ANCHOR],
      },
      {
        itemId: "item_fixture_socks",
        name: "Kolam Run cushioned socks, 3 pack",
        cues: [OBSTRUCTION],
      },
    ],
  };
}

export function fixtureDemand(): DemandView {
  return {
    live: false,
    unmet: [
      {
        query: "linen shirt medium",
        asks: 7,
        lastAt: "2026-08-30T18:20:00.000Z",
      },
      {
        query: "trail running shoes uk 10",
        asks: 4,
        lastAt: "2026-08-29T09:05:00.000Z",
      },
      { query: "cotton dhoti", asks: 2, lastAt: "2026-08-28T11:41:00.000Z" },
    ],
  };
}

export function fixtureLeakage(): LeakageView {
  const desk = standing();
  return {
    live: false,
    counters: desk.counters,
    stockConflicts: desk.stockConflicts,
    refusals: [
      { reasonCode: "CART_QUOTE_MISMATCH", count: 2 },
      { reasonCode: "QUOTE_EXPIRED", count: 5 },
      { reasonCode: "REFUNDABILITY_REQUIRED", count: 3 },
      { reasonCode: "COOLOFF_HOLD", count: 1 },
    ],
  };
}
