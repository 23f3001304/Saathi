import type { AggregateGate } from "./k-anonymizer.js";

/** The `k_anonymity` field of the `GET /recs` response (section 4.10) — the
 * gate's own shape minus `allowed`, which the response never needs to leak. */
export interface KAnonymitySummary {
  readonly k: number;
  readonly suppressed: boolean;
}

export function toSummary(gate: AggregateGate): KAnonymitySummary {
  return { k: gate.k, suppressed: gate.suppressed };
}
