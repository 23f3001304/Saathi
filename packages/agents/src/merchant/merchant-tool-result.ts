import type { EnvelopeFailure } from "../shared/tool-envelope-verifier.js";

/**
 * Why the merchant would not answer, when the request itself was well formed.
 * Both are structural: this shelf does not carry that SKU, or this session has
 * already had every quote it is going to get. Neither changes on a retry, and
 * they used to be one string — `unknown_sku` for both — so a caller could not
 * tell "there is no such thing" from "not again".
 */
export type MerchantRefusal = "not_stocked" | "rounds_exhausted";

export type MerchantToolResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly failure: EnvelopeFailure | MerchantRefusal };

const REFUSALS: ReadonlySet<string> = new Set([
  "not_stocked",
  "rounds_exhausted",
]);

/** Whether asking again could possibly help. */
export function isMerchantRefusal(failure: string): boolean {
  return REFUSALS.has(failure);
}

/**
 * Every string the merchant did not sign is wrapped, so a consumer cannot read
 * it without also reading where it came from. The tag travels with the value
 * rather than beside it — a provenance label in a sibling field is a label
 * that gets dropped by the first `map`.
 */
export interface UntrustedText {
  readonly provenance: "untrusted_text";
  readonly value: string;
}

export function untrusted(value: string): UntrustedText {
  return { provenance: "untrusted_text", value };
}
