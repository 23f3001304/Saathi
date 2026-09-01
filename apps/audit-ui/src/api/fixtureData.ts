// Canned REST snapshots for `dev:fixtures` / `?seed=demo` — the §2.2/§2.3
// mockup numbers, kept internally consistent with the ledger fixtures.
import type {
  FoldSummary,
  LedgerHead,
  MerchantTrustEntry,
  PricePoint,
  ReadyzResponse,
  ReplayResult,
  VerifyResult,
} from "./types.ts";

export { covenantSnapshot } from "./fixtureCovenant.ts";

export function readyzResponse(): ReadyzResponse {
  return {
    ready: true,
    checks: { ledgerOpen: true, jwksLoaded: true, rzpReachable: true },
  };
}

export function ledgerHead(): LedgerHead {
  return { height: 1284, headHash: "a91f4c2e" };
}

export function foldSummary(): FoldSummary {
  return [
    {
      fold: "Price history",
      headline: "34 products · 812 prices",
      detail: "each with the day it applied",
    },
    {
      fold: "Merchant trust",
      headline: "3 merchants",
      detail: "0.4% of quotes broken",
    },
    {
      fold: "Preferences",
      headline: "11 things you signed",
      detail: "2 you later regretted",
    },
  ];
}

export function merchantTrust(): MerchantTrustEntry[] {
  return [
    {
      merchant: "acme-grocers",
      score: 94,
      honouredFraction: 0.94,
      unknownFraction: 0.06,
      mismatchFraction: 0,
      quoteMismatch: "0 of 41",
      manipulation: 0,
      refunds: "3",
      flagged: false,
    },
    {
      merchant: "sundar-textiles",
      score: 71,
      honouredFraction: 0.71,
      unknownFraction: 0.18,
      mismatchFraction: 0.11,
      quoteMismatch: "2 of 18",
      manipulation: 1,
      refunds: "1",
      flagged: false,
    },
    {
      merchant: "nilgiri-foods",
      score: 38,
      honouredFraction: 0.38,
      unknownFraction: 0.29,
      mismatchFraction: 0.33,
      quoteMismatch: "1 of 9",
      manipulation: 3,
      refunds: "0",
      flagged: true,
    },
  ];
}

export function priceHistory(sku: string): PricePoint[] {
  const now = Date.now();
  const days = 34;
  // Deterministic per-sku wobble so different SKUs don't render an identical line.
  const modal = 129_900 + (sku.length % 3) * 100;
  return Array.from({ length: days }, (_, i) => {
    const isSpike = i >= days - 4;
    return {
      ts: new Date(now - (days - i) * 86_400_000).toISOString(),
      pricePaise: modal,
      ...(isSpike ? { listedMrpPaise: 299_900 } : {}),
    };
  });
}

export function verifyResult(): VerifyResult {
  return { ok: true, height: 1284, ms: 38 };
}

export function replayResult(): ReplayResult {
  return {
    ok: true,
    liveStateHash: "9c1e77ab",
    replayedStateHash: "9c1e77ab",
    events: 1284,
    ms: 41,
  };
}
