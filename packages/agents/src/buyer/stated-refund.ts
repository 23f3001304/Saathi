/**
 * Whether the shopper asked to be able to send it back.
 *
 * `requires_refundability` used to be a literal `true` on every deterministic
 * draft. That is a hardcoded answer to a question the shopper answers for
 * themselves, and it is not the safe default it looks like: it signed a bound
 * over requests that never mentioned returns, and then refused every cart from
 * a merchant who attests no returns policy — a refusal about a term the shopper
 * never asked for.
 *
 * Narrow and deterministic, for the same reason `statedCeilingPaise` is: a
 * model may propose the flag and usually will, and this decides what the
 * sentence itself supports when no model answered.
 */
const REFUND_PHRASES: readonly RegExp[] = [
  /\brefundab(?:le|ility)\b/i,
  /\brefunds?\b/i,
  /\breturnable\b/i,
  /\bcan\s+(?:be\s+)?return(?:ed)?\b/i,
  /\bfree\s+returns?\b/i,
  /\bwith\s+returns?\b/i,
  /\bmoney\s*-?\s*back\b/i,
];

export function demandsRefund(request: string): boolean {
  return REFUND_PHRASES.some((phrase) => phrase.test(request));
}
