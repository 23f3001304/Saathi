import type { IsoTimestamp, MemoryType } from "@covenant/domain";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface DecayRow {
  readonly type: MemoryType;
  /** `null` matches any predicate of that type. */
  readonly predicate: string | null;
  readonly etaSeconds: number;
  readonly kappa: number;
}

/**
 * SSGM's form: `w(Δτ) = exp(−(Δτ / η)^κ)`, with `Δτ` measured from `t_created`
 * — system-time, what we *learned*, which is what staleness is about (§9.3).
 *
 * One frozen table so tuning is a reviewable diff. κ>1 gives a plateau then a
 * cliff (a quote is good all morning and worthless tomorrow); κ<1 gives a
 * heavy tail (old preferences fade but never vanish).
 *
 * DECISION: a `fact` catch-all row is added below §9.3's five named
 * predicates. Why: the read gate must score a `fact` whose predicate is not in
 * the table, and defaulting it to the 45-minute `stock` cliff would silently
 * retire ordinary facts while defaulting to `price` would misprice them; the
 * near-exponential merchant-policy row is the honest neutral.
 */
export const DECAY_PARAMS: readonly DecayRow[] = [
  { type: "fact", predicate: "price", etaSeconds: 6 * HOUR, kappa: 1.6 },
  { type: "fact", predicate: "stock", etaSeconds: 45 * MINUTE, kappa: 2.0 },
  { type: "fact", predicate: "terms", etaSeconds: 30 * DAY, kappa: 1.1 },
  { type: "fact", predicate: "policy", etaSeconds: 30 * DAY, kappa: 1.1 },
  { type: "fact", predicate: "shipping", etaSeconds: 30 * DAY, kappa: 1.1 },
  { type: "fact", predicate: null, etaSeconds: 30 * DAY, kappa: 1.1 },
  { type: "preference", predicate: null, etaSeconds: 180 * DAY, kappa: 0.9 },
  { type: "procedure", predicate: null, etaSeconds: 365 * DAY, kappa: 0.8 },
  { type: "episode", predicate: null, etaSeconds: 90 * DAY, kappa: 1.0 },
];

/** What decays. `constraint` is absent on purpose (decision 40). */
export type DecayParams = Pick<DecayRow, "etaSeconds" | "kappa">;

/**
 * Constraints do not decay: a decayed constraint is a constraint that quietly
 * stops binding, which is the opposite of a Ulysses contract (§9.3). They
 * leave only by user action — a P3 write setting `t_expired`.
 */
export function paramsFor(
  type: MemoryType,
  predicate: string | null,
): DecayParams | null {
  if (type === "constraint") {
    return null;
  }
  const exact = DECAY_PARAMS.find(
    (row) => row.type === type && row.predicate === predicate,
  );
  const fallback = DECAY_PARAMS.find(
    (row) => row.type === type && row.predicate === null,
  );
  return exact ?? fallback ?? null;
}

export function decayWeight(
  params: DecayParams,
  elapsedSeconds: number,
): number {
  if (elapsedSeconds <= 0) {
    return 1;
  }
  return Math.exp(-Math.pow(elapsedSeconds / params.etaSeconds, params.kappa));
}

/** `η·(ln2)^(1/κ)` — the column §9.3 states, and what the table test asserts. */
export function halfLifeSeconds(params: DecayParams): number {
  return params.etaSeconds * Math.pow(Math.LN2, 1 / params.kappa);
}

/** The subset of a `MemoryEntry` decay depends on, so the scorer stays pure. */
export interface DecayableEntry {
  readonly type: MemoryType;
  readonly predicate: string | null;
  readonly tCreated: IsoTimestamp;
}

export function weightFor(entry: DecayableEntry, now: Date): number {
  const params = paramsFor(entry.type, entry.predicate);
  if (params === null) {
    return 1;
  }
  const born = Date.parse(entry.tCreated);
  // An unparseable timestamp made the whole ranking NaN: NaN weight times
  // anything is NaN, and a NaN in a sort comparator scrambles every row.
  // A row whose age is unknown decays as brand new rather than poisoning
  // the list.
  if (!Number.isFinite(born)) return 1;
  const elapsed = (now.getTime() - born) / 1000;
  return decayWeight(params, elapsed);
}
