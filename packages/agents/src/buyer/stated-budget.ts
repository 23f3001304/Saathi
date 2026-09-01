/**
 * The number the shopper actually said.
 *
 * A shopper asked for navy running shoes "under 4000 rupees" and the mandate
 * that got signed read "at most 5000.00 INR": the drafter used the host's
 * configured cap and nobody read the sentence. A cap is an outer bound the
 * operator sets. What the shopper said is a bound *they* set, and the signed
 * ceiling has to be the tighter of the two — a mandate looser than the
 * instruction that produced it is the exact failure this system exists to make
 * impossible, and it is worse coming from us than from a merchant.
 *
 * Parsing is deliberately narrow and deliberately deterministic. A model may
 * propose a ceiling and often will; this decides the most it is allowed to be,
 * and it must hold whichever model answered and however persuasive the page
 * was. Anything it cannot read confidently returns null and the cap stands.
 */

const PAISE_PER_RUPEE = 100;

/** `2,000` / `2000` / `2k` / `2.5k`, with the separators people actually type. */
const AMOUNT = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?`;

/** Only phrasings that bound from above. "around 4000" is not a ceiling. */
const CEILING_PHRASES: readonly RegExp[] = [
  new RegExp(String.raw`\bunder\s*(?:₹|rs\.?|inr)?\s*${AMOUNT}`, "i"),
  new RegExp(String.raw`\bbelow\s*(?:₹|rs\.?|inr)?\s*${AMOUNT}`, "i"),
  new RegExp(
    String.raw`\b(?:at\s*most|max(?:imum)?)\s*(?:₹|rs\.?|inr)?\s*${AMOUNT}`,
    "i",
  ),
  new RegExp(
    String.raw`\b(?:up\s*to|no\s*more\s*than)\s*(?:₹|rs\.?|inr)?\s*${AMOUNT}`,
    "i",
  ),
  new RegExp(String.raw`\bwithin\s*(?:₹|rs\.?|inr)?\s*${AMOUNT}`, "i"),
  new RegExp(
    String.raw`\bbudget\s*(?:of|is)?\s*(?:₹|rs\.?|inr)?\s*${AMOUNT}`,
    "i",
  ),
  new RegExp(String.raw`(?:₹|rs\.?|inr)\s*${AMOUNT}\s*(?:or\s*less|max)`, "i"),
];

function rupeesOf(digits: string, scale: string | undefined): number | null {
  const value = Number(digits.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return scale === undefined ? value : value * 1000;
}

/** The ceiling the sentence states, in paise, or `null` if it states none. */
export function statedCeilingPaise(request: string): number | null {
  for (const phrase of CEILING_PHRASES) {
    const found = phrase.exec(request);
    const digits = found?.[1];
    if (digits === undefined) continue;
    const rupees = rupeesOf(digits, found?.[2]?.toLowerCase());
    if (rupees === null) continue;
    return Math.round(rupees * PAISE_PER_RUPEE);
  }
  return null;
}

/**
 * The most a mandate for this request may authorise. Never above the operator's
 * cap, never above what the shopper said, and never zero — a ceiling of nothing
 * is not a bounded intent, it is an unsignable one.
 */
export function ceilingFor(request: string, capPaise: number): number {
  const stated = statedCeilingPaise(request);
  if (stated === null) return capPaise;
  return Math.max(1, Math.min(stated, capPaise));
}
