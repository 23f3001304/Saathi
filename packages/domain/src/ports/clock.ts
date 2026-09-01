/** Determinism seam for every test: no package ever calls `Date.now()`. */
export interface Clock {
  now(): Date;
}
