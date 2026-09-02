/** Uniform [0, 1) source, injected so the noise draw stays testable (constructor
 * injection only — no package calls `Math.random()` directly, per §12). */
export interface RandomSource {
  next(): number;
}

/** The production adapter; `new`ed only in a composition root. */
export class MathRandomSource implements RandomSource {
  next(): number {
    return Math.random();
  }
}

export interface AggregateGate {
  readonly allowed: boolean;
  readonly k: number;
  readonly suppressed: boolean;
}

/** ARCHITECTURE section 5.8: "cross-user aggregates ship only k-anonymized
 * with noise". Below this many distinct contributors, a bucket is suppressed
 * regardless of consent — five people's data is not yet an aggregate. */
export const MIN_K = 5;

/**
 * Enforces `share_aggregates` consent, k >= 5 bucket suppression, and
 * Laplace noise on aggregates (backend-architecture.md section 2.6). Stateless
 * and collaborator-free except for the injected randomness seam; every method
 * is pure given its `RandomSource` draw.
 */
export class KAnonymizer {
  constructor(private readonly random: RandomSource) {}

  /**
   * Whether a cross-user aggregate (merchant trust, regret weighting) may be
   * surfaced: the requester must have opted in, and enough distinct people
   * must back the aggregate that no individual's behaviour is exposed.
   */
  gate(consented: boolean, distinctContributors: number): AggregateGate {
    const suppressed = distinctContributors < MIN_K;
    return { allowed: consented && !suppressed, k: distinctContributors, suppressed };
  }

  /** Laplace-mechanism noised count; never publish the raw count instead. */
  noisedCount(count: number, scale = 1): number {
    return Math.max(0, Math.round(count + laplaceSample(this.random.next(), scale)));
  }
}

function laplaceSample(uniform: number, scale: number): number {
  const centred = uniform - 0.5;
  // uniform can be exactly 0 or 1, where the log runs to -Infinity and one
  // sample corrupts every count it touches. Clamped inside the open interval.
  const clamped = Math.min(Math.max(Math.abs(centred), 0), 0.5 - Number.EPSILON);
  return -scale * Math.sign(centred) * Math.log(1 - 2 * clamped);
}
