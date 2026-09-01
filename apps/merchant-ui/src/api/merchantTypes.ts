// The merchant console's view types. Separate from api/types.ts because that
// file is the buyer's read of the gateway; this is the seller's.

export type MerchantItemView = {
  itemId: string;
  name: string;
  /** The full Razorpay description, product-page line and all. */
  description: string;
  amountPaise: number;
  currency: string;
  active: boolean;
  /** The lowest an agent may settle at without asking. `null` = no authority. */
  floorPaise: number | null;
  /** The listed price the band was declared under, for spotting a stale band. */
  floorListPaise: number | null;
};

/** `live: false` means these rows are fixtures, and the screen says so. */
export type ShelfView = {
  items: MerchantItemView[];
  live: boolean;
};

export type TrustTermView = {
  term: string;
  label: string;
  weight: number;
  rate: number;
  kept: number;
  of: number;
};

export type MerchantCounters = {
  quotesTotal: number;
  quoteMismatches: number;
  catalogReads: number;
  manipulationAttempts: number;
  refundsRequested: number;
  refundsHonored: number;
  cooloffCancellations: number;
  cartsTotal: number;
};

export type StandingView = {
  merchant: string;
  score: number;
  observations: number;
  priorPseudoCount: number;
  priorScore: number;
  contributions: TrustTermView[];
  counters: MerchantCounters;
  stockConflicts: number;
};

export type EnrolmentView = {
  issuer: string;
  kids: string[];
};

export type MerchantDeskView = {
  merchants: StandingView[];
  enrolled: EnrolmentView[];
  live: boolean;
};

export const TERM_LABELS: Record<string, string> = {
  quote_match: "Prices you kept",
  clean_channel: "Listings with nothing hidden in them",
  refunds_honoured: "Refunds honoured",
};

/** One dark-pattern cue found in the merchant's own copy, with its counter. */
export type CueView = {
  kind: string;
  phrase: string;
  bias: string;
  counter: string;
};

export type AuditedListingView = {
  itemId: string;
  name: string;
  cues: CueView[];
};

export type ListingAuditView = {
  listings: AuditedListingView[];
  byKind: Record<string, number>;
  clean: number;
  live: boolean;
};

/** One order, as a payment record. There is no fulfilment state here because
 *  there is no fulfilment: Covenant settles money and holds no stock. */
export type OrderView = {
  txnId: string;
  state: string;
  amountPaise: number;
  currency: string;
  merchantIssuer: string | null;
  cartMandateId: string;
  createdAt: string | null;
  cooloffUntil: string | null;
};

export type OrdersView = {
  orders: OrderView[];
  live: boolean;
};

export type UnmetAskView = {
  query: string;
  asks: number;
  lastAt: string;
};

export type DemandView = {
  unmet: UnmetAskView[];
  live: boolean;
};

/** One SKU's week inside its band, as the console shows it. */
export type SettledSkuView = {
  skuId: string;
  carts: number;
  clearedFloor: number;
  savedPaise: number;
  floorPaise: number;
  listPaise: number;
  lastAt: string;
};

export type NegotiatedView = {
  settled: SettledSkuView[];
  windowDays: number;
  live: boolean;
};

export type RefusalView = {
  reasonCode: string;
  count: number;
};

export type LeakageView = {
  refusals: RefusalView[];
  counters: MerchantCounters;
  stockConflicts: number;
  live: boolean;
};

export const CUE_LABELS: Record<string, string> = {
  scarcity: "Scarcity",
  urgency: "Urgency",
  false_anchor: "False anchor",
  drip_pricing: "Drip pricing",
  confirmshaming: "Confirmshaming",
  preselection: "Preselection",
  social_proof: "Social proof",
  obstruction: "Obstruction",
};
