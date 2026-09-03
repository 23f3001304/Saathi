/**
 * The scripted fake model's reading of a sentence: the ceiling it states and
 * whether it asks for returns. Live mode never runs this. The model proposes
 * `max_amount_paise` and `requires_refundability` in `propose_purchase`, the
 * collector checks them against the operator's cap, and the human sees them
 * on the sheet. Scripted mode has no model, so the script reads the number
 * itself, and its rule stands: a mandate is never looser than the sentence.
 *
 * Both readings are narrow for the same reason. `requires_refundability` used
 * to be a literal `true` on every deterministic draft, which signed a bound
 * over requests that never mentioned returns and then refused every cart from
 * a merchant attesting no returns policy: a refusal about a term the shopper
 * never asked for. So each flag is read off the sentence or left off.
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
  // Hinglish bounds-from-above: "4000 tak", "5000 ke andar", "3000 se kam".
  // Written in English letters because that is how they arrive; a budget the
  // shopper stated in their own words must bind exactly like "under 4000".
  new RegExp(String.raw`(?:₹|rs\.?|inr)?\s*${AMOUNT}\s*(?:rs\.?|₹|inr)?\s*(?:tak|ke\s*andar|se\s*kam|se\s*neeche)`, "i"),
  // Currency written after the number: "50000RS MAX", "50000 rs max". The
  // earlier shape required rs BEFORE the amount and this stated ceiling
  // never bound at all.
  new RegExp(String.raw`${AMOUNT}\s*(?:rs\.?|₹|inr)?\s*(?:max|or\s*less)`, "i"),
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

/** Whether the shopper asked to be able to send it back, in the phrasings
 *  that actually ask for it. */
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
