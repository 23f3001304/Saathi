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
    mrpClaimPaise?: number;
    daysAtPrice?: number;
    ofDays?: number;
    honourRate?: number;
    whyThis?: string;
};
export type ChatBeat = {
    offsetMs: number;
    kind: "intent-draft";
    description: string;
} | {
    offsetMs: number;
    kind: "intent-signed";
    capPaise: number;
    thumbprint: string;
} | {
    offsetMs: number;
    kind: "message";
    text: string;
    variant?: "system";
} | {
    offsetMs: number;
    kind: "sort-key";
    sortKey: string;
    memoryId: string;
    label: string;
} | {
    offsetMs: number;
    kind: "options";
    options: OptionRowData[];
} | {
    offsetMs: number;
    kind: "cart";
    itemCount: number;
    totalPaise: number;
    digest: string;
    quoteOk: boolean;
} | {
    offsetMs: number;
    kind: "signing-required";
};
export declare const HAPPY_OPTIONS: OptionRowData[];
export declare const HAPPY_CHAT_SCRIPT: ChatBeat[];
export declare const T1_CHAT_SCRIPT: ChatBeat[];
//# sourceMappingURL=chatScript.d.ts.map