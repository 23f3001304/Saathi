/**
 * Bayesian-shrunk merchant trust score (backend-architecture.md section 3.9),
 * a pure function over the `merchant_trust` counters. `stock_conflicts` is
 * deliberately absent from this interface: losing a legitimate last-unit race
 * is not merchant misbehaviour, and folding it in would punish popular
 * merchants and corrupt the one signal meant to catch drip pricing (section
 * 5.2 d). `carts_total` and `cooloff_cancellations` are tracked in the table
 * for display but are likewise not inputs to the score.
 */
export interface TrustCounters {
  readonly quotesTotal: number;
  readonly quoteMismatches: number;
  readonly catalogReads: number;
  readonly manipulationAttempts: number;
  readonly refundsRequested: number;
  readonly refundsHonored: number;
}

const PRIOR_PSEUDO_COUNT = 5;
const PRIOR_SCORE = 0.5;

const RATE_WEIGHTS = {
  mismatch: 0.6,
  manipulation: 0.25,
  honor: 0.15,
} as const;

export function scoreFor(counters: TrustCounters): number {
  const mismatchRate = rateOf(counters.quoteMismatches, counters.quotesTotal);
  const manipulationRate = rateOf(
    counters.manipulationAttempts,
    counters.catalogReads,
  );
  const raw =
    RATE_WEIGHTS.mismatch * (1 - mismatchRate) +
    RATE_WEIGHTS.manipulation * (1 - manipulationRate) +
    RATE_WEIGHTS.honor * honorRateOf(counters);
  const observations = counters.quotesTotal + counters.catalogReads;
  return (
    (observations * raw + PRIOR_PSEUDO_COUNT * PRIOR_SCORE) /
    (observations + PRIOR_PSEUDO_COUNT)
  );
}

export const TRUST_TERMS = [
  "quote_match",
  "clean_channel",
  "refunds_honoured",
] as const;

export type TrustTerm = (typeof TRUST_TERMS)[number];

/** One weighted term as a merchant can read it: a rate, and what it is out of. */
export interface TrustContribution {
  readonly term: TrustTerm;
  readonly weight: number;
  readonly rate: number;
  readonly kept: number;
  readonly of: number;
}

export interface TrustExplanation {
  readonly score: number;
  readonly contributions: readonly TrustContribution[];
  /** Observations behind the score; below the pseudo-count it is mostly prior. */
  readonly observations: number;
  readonly priorPseudoCount: number;
  readonly priorScore: number;
}

/**
 * The same arithmetic `scoreFor` runs, with its working shown. It exists so the
 * merchant console can say *why* rather than print a number, and so there is
 * one place the weights live — a second copy in a UI would be a second answer.
 */
export function explainScore(counters: TrustCounters): TrustExplanation {
  return {
    score: scoreFor(counters),
    observations: counters.quotesTotal + counters.catalogReads,
    priorPseudoCount: PRIOR_PSEUDO_COUNT,
    priorScore: PRIOR_SCORE,
    contributions: [
      {
        term: "quote_match",
        weight: RATE_WEIGHTS.mismatch,
        rate: 1 - rateOf(counters.quoteMismatches, counters.quotesTotal),
        kept: counters.quotesTotal - counters.quoteMismatches,
        of: counters.quotesTotal,
      },
      {
        term: "clean_channel",
        weight: RATE_WEIGHTS.manipulation,
        rate: 1 - rateOf(counters.manipulationAttempts, counters.catalogReads),
        kept: counters.catalogReads - counters.manipulationAttempts,
        of: counters.catalogReads,
      },
      {
        term: "refunds_honoured",
        weight: RATE_WEIGHTS.honor,
        rate: honorRateOf(counters),
        kept: counters.refundsHonored,
        of: counters.refundsRequested,
      },
    ],
  };
}

function rateOf(numerator: number, denominator: number): number {
  return numerator / Math.max(denominator, 1);
}

function honorRateOf(counters: TrustCounters): number {
  return counters.refundsRequested === 0
    ? 1
    : counters.refundsHonored / counters.refundsRequested;
}
