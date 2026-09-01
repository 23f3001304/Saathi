// §4.3 — response shapes for the plain-fetch resources. Kept separate from
// ledger/types.ts (the SSE contract) because these are REST snapshots, not
// frames folded from the log.
export type Constraint = {
  key: string;
  label: string;
  value: string | number | boolean;
  unit?: "paise" | "percent" | "time" | "boolean" | "window" | "category";
  signedAt?: string;
  amended: boolean;
};

export type Envelope = {
  category: string;
  capturedPaise: number;
  committedPaise: number;
  capPaise: number;
};

export type CoolOffRule = { thresholdPaise: number; durationHours: number };

export type CovenantSnapshot = {
  constraints: Constraint[];
  envelopes: Envelope[];
  cooloffRules: CoolOffRule[];
  merchants: string[];
  skus: string[];
};

export type FoldTileSummary = {
  fold: string;
  headline: string;
  detail: string;
};
export type FoldSummary = FoldTileSummary[];

export type MerchantTrustEntry = {
  merchant: string;
  score: number;
  honouredFraction: number;
  unknownFraction: number;
  mismatchFraction: number;
  quoteMismatch: string;
  manipulation: number;
  refunds: string;
  flagged: boolean;
};

export type PricePoint = {
  ts: string;
  pricePaise: number;
  listedMrpPaise?: number;
};

export type TransactionSummary = {
  txnId: string;
  shortId: string;
  ts: string;
  state: "captured" | "failed" | "parked" | "pending";
};

export type HealthChecks = {
  ledgerOpen: boolean;
  jwksLoaded: boolean;
  rzpReachable: boolean;
};
export type ReadyzResponse = { ready: boolean; checks: HealthChecks };
export type LedgerHead = { height: number; headHash: string };

export type VerifyResult = { ok: boolean; height: number; ms: number };
export type ReplayResult = {
  ok: boolean;
  liveStateHash: string;
  replayedStateHash: string;
  events: number;
  ms: number;
  firstDivergentId?: number;
};
