// DECISION: the conversation pane is wired to fixture data (the brief:
// "buyer-chat pane wired to fixture data for now") — a scripted beat list
// replayed on a timer, the same shape agent-host's SSE would eventually
// drive. Mirrors §8's 0:30–1:52 demo beats for the happy-purchase run.
export type OptionRowData = {
  id: string;
  sku: string;
  title: string;
  pricePaise: number;
  rating: number;
  deliveryDays: number;
  merchant: string;
  /**
   * The merchant's own picture, on the merchant's own host — a claim like the
   * price and the prose, and evidence of nothing. Absent where the merchant
   * gave none, and the card falls back to a woven plate rather than inventing
   * one. Only `https:` is ever rendered; see `primitives/ProductImage.tsx`.
   */
  imageUrl?: string;
  /**
   * Provenance, all optional — this is what the card shows that a plain
   * product card cannot. `quoteSigned` is the evidence tier: a
   * merchant-signed quote we can hold them to, versus a listing we merely
   * scraped. `mrpClaimPaise` is the merchant's own strikethrough claim,
   * checkable against `daysAtPrice`/`ofDays` from the price fold.
   * `honourRate` is the merchant's quote-honour rate from the recs fold.
   * `whyThis` ties the row to the buyer's own P3 preference in plain words.
   *
   * There is deliberately still no field here that ranks or promotes a row
   * (see OptionSet.tsx) — provenance is evidence, not placement.
   */
  quoteSigned?: boolean;
  /**
   * The listing the row was read off, present only on a row the agent found on
   * the open web. It is what lets the card say *where* an unsigned number came
   * from — and tapping such a card sends the agent back to that page in the
   * sandbox, so the URL is also the pick's identity (`POST /chat/web-pick`).
   */
  sourceUrl?: string;
  mrpClaimPaise?: number;
  daysAtPrice?: number;
  ofDays?: number;
  honourRate?: number;
  whyThis?: string;
};

export type ChatBeat =
  | { offsetMs: number; kind: "intent-draft"; description: string }
  | {
      offsetMs: number;
      kind: "intent-signed";
      capPaise: number;
      thumbprint: string;
    }
  | { offsetMs: number; kind: "message"; text: string; variant?: "system" }
  | {
      offsetMs: number;
      kind: "sort-key";
      sortKey: string;
      memoryId: string;
      label: string;
    }
  | { offsetMs: number; kind: "options"; options: OptionRowData[] }
  | {
      offsetMs: number;
      kind: "cart";
      itemCount: number;
      totalPaise: number;
      digest: string;
      quoteOk: boolean;
    }
  | { offsetMs: number; kind: "signing-required" };

export const HAPPY_OPTIONS: OptionRowData[] = [
  {
    id: "A",
    sku: "sundar-kurta-navy",
    title: "Navy Kurta",
    pricePaise: 129_900,
    rating: 4.2,
    deliveryDays: 2,
    merchant: "Sundar Textiles",
    quoteSigned: true,
    daysAtPrice: 30,
    ofDays: 34,
    honourRate: 0.98,
    whyThis:
      "Under your ₹2,000 cap, from a merchant you have bought from before.",
  },
  {
    id: "B",
    sku: "acme-kurta-navy",
    title: "Navy Kurta (Acme)",
    pricePaise: 134_900,
    rating: 4.4,
    deliveryDays: 1,
    merchant: "Acme Grocers",
    quoteSigned: true,
    mrpClaimPaise: 299_900,
    daysAtPrice: 31,
    ofDays: 34,
    honourRate: 0.94,
    whyThis: "Fastest delivery, still under your cap.",
  },
  {
    id: "C",
    sku: "nilgiri-kurta-navy",
    title: "Navy Kurta (Nilgiri)",
    pricePaise: 141_000,
    rating: 4.1,
    deliveryDays: 3,
    merchant: "Nilgiri Foods",
    quoteSigned: false,
    honourRate: 0.71,
    whyThis: "Matches the colour and fabric you asked for.",
  },
];

export const HAPPY_CHAT_SCRIPT: ChatBeat[] = [
  {
    offsetMs: 0,
    kind: "intent-draft",
    description:
      "A navy kurta under ₹2,000, from a merchant I've bought from before.",
  },
  { offsetMs: 400, kind: "signing-required" },
  {
    offsetMs: 900,
    kind: "intent-signed",
    capPaise: 200_000,
    thumbprint: "ES256 · did:key:z6Mk8Qr2f",
  },
  {
    offsetMs: 1500,
    kind: "message",
    text: "I found three that fit: sorting by total landed cost, from your saved preference.",
  },
  {
    offsetMs: 1700,
    kind: "sort-key",
    sortKey: "total landed cost, ascending",
    memoryId: "mem-pref-sort",
    label: "your P3 preference",
  },
  { offsetMs: 1900, kind: "options", options: HAPPY_OPTIONS },
  {
    offsetMs: 8500,
    kind: "cart",
    itemCount: 1,
    totalPaise: 129_900,
    digest: "7e6ed274ac4195e1f1525447a23db0b2def1ae1d48bcb86c0b1f8967a7ec66d0",
    quoteOk: true,
  },
];
