/**
 * Where a delivery form's boxes are named, and the one place they are named.
 *
 * Two callers read this table and they must agree, or the system contradicts
 * itself in the worst possible way: `FieldClassifier` uses it to decide that a
 * box on a checkout page is an address rather than an unrecognised field, and
 * the host's filler uses it to decide which stated trait belongs in which box.
 * If those two lists ever drifted, the classifier would permit a field the
 * filler would fill with the wrong thing.
 */

/** Slots a shop's delivery form can ask for, and the words that name each one.
 *  `name` is last so "full name" resolves before the bare word does. */
export const DELIVERY_SLOTS: readonly (readonly [string, RegExp])[] = [
  ["postcode", /\b(pin ?-?code|pincode|postal|post ?code|zip)\b/],
  ["phone", /\b(phone|mobile|tel|contact ?number)\b/],
  ["email", /\b(e ?mail)\b/],
  ["street", /\b(address|street|flat|house|building|apartment|line ?1|addr)\b/],
  ["locality", /\b(locality|landmark|area|line ?2)\b/],
  ["city", /\b(city|town|district)\b/],
  ["state", /\b(state|province|region)\b/],
  ["country", /\b(country)\b/],
  ["name", /\b(full ?name|first ?name|last ?name|recipient|name)\b/],
];

/**
 * Words that put a field beyond this table whatever else it says.
 *
 * DECISION: not a second classifier — `FieldClassifier`'s credential rules run
 * ahead of every use of this table and have the last word. This is narrower and
 * earlier: it keeps a box that is plainly a payment field from being *called* a
 * delivery field at all, so "Name on card" can never be read as a recipient
 * name on its way to being typed into.
 */
const NEVER = /\b(card|cvv|cvc|upi|vpa|password|otp|ifsc|aadhaar|uidai)\b/;

export function deliveryWordsOf(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Which delivery slot these words name, or `null` for anything else. */
export function deliverySlotOf(raw: string): string | null {
  const words = deliveryWordsOf(raw);
  if (NEVER.test(words)) {
    return null;
  }
  const found = DELIVERY_SLOTS.find(([, pattern]) => pattern.test(words));
  return found === undefined ? null : found[0];
}

/**
 * The slots that are unambiguously *postal*, and the only ones the classifier
 * exempts inside a checkout scope.
 *
 * DECISION: `name` and `email` are deliberately absent, and the reason is a
 * pair of cases that were already in the matrix — a bare "fullName" on a
 * checkout page, an "email" on a form posting to `/checkout/pay`. Those are
 * what a *payment* form asks for as much as a delivery one: the cardholder's
 * name, the billing address for the receipt. Where the two forms want the same
 * box, the agent does not get to decide which form it is looking at. It fills
 * them happily on a delivery page — no payment scope, no rule — and leaves them
 * blank and named on a checkout page.
 *
 * `phone` stays: a delivery form on an Indian shop cannot proceed without one,
 * it is not a payment credential, and every credential table — OTP, UPI, card —
 * is consulted before this exemption is reached.
 */
const POSTAL: ReadonlySet<string> = new Set([
  "street",
  "locality",
  "city",
  "state",
  "postcode",
  "country",
  "phone",
]);

/**
 * Whether these words name a postal field — a positive identification, and
 * never a fallback for a field nothing recognised. This is the question
 * `FieldClassifier` asks; the filler asks `deliverySlotOf`, which is wider.
 */
export function isDeliveryField(raw: string): boolean {
  const slot = deliverySlotOf(raw);
  return slot !== null && POSTAL.has(slot);
}
