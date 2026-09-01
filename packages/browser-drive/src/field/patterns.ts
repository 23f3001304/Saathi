/**
 * Every regex the classifier can fire, in one place so the security surface is
 * reviewable as a list rather than hunted through control flow. All patterns
 * run against text already squashed by `normalize` (punctuation → spaces,
 * lowercased), which is why they read in spaces rather than hyphens.
 */

export const PASSWORD_AUTOCOMPLETE = /\b(current|new)\s+password\b/;
export const PASSWORD_NAMED =
  /\b(password|passwd|pwd|pass\s+phrase|passphrase|senha|contrasena)\b|पासवर्ड/;

export const OTP_AUTOCOMPLETE = /\bone\s+time\s+code\b/;
export const OTP_NAMED =
  /\b(otp|o\s?t\s?p|one\s+time\s+(code|password|pin)|verification\s+code|verify\s+code|auth\s+code|authentication\s+code|security\s+code|sms\s+code|passcode|mfa|2fa|tfa)\b|ओटीपी|सत्यापन\s*कोड/;
/** Weaker words that only mean OTP when the field is also short and numeric. */
export const OTP_WEAK = /\b(code|pin|digits?|verify|verification)\b|कोड/;

export const CVV_NAMED =
  /\b(cvv|cvc|csc|cvv2|cid|cc\s+csc|card\s+(security|verification)\s+(code|number|value))\b/;

export const CARD_AUTOCOMPLETE =
  /\bcc\s+(number|name|exp|exp\s+month|exp\s+year|type|given\s+name|family\s+name|additional\s+name)\b/;
export const CARD_NAMED =
  /\b(card\s+(number|no|num|holder|name|expiry|expiration)|cardnumber|(credit|debit)\s+card|pan\s+number|exp\s+(month|year|date)|expiry\s+(month|year|date)|valid\s+thru)\b|कार्ड\s*(नंबर|संख्या)/;

export const UPI_PIN_NAMED =
  /\b(upi\s+pin|upipin|m\s?pin|mpin|atm\s+pin|txn\s+pin|transaction\s+pin|debit\s+card\s+pin)\b|यूपीआई\s*पिन/;
export const UPI_VPA_NAMED =
  /\b(upi\s+id|upi\s+address|vpa|virtual\s+payment\s+address|payee\s+address)\b|यूपीआई\s*आईडी/;

export const AADHAAR_NAMED =
  /\b(aadhaar|aadhar|adhaar|uidai|vid\s+number)\b|आधार/;

export const BANK_ACCOUNT_NAMED =
  /\b(account\s+number|acct\s+no|acct\s+number|bank\s+account|ifsc|micr|routing\s+number|iban|swift\s+code|sort\s+code)\b|खाता\s*संख्या/;

/**
 * Button text that commits money. English plus the Hindi renderings a real
 * Indian checkout ships — a classifier that only reads English is a classifier
 * that fails in the market this is built for.
 */
export const PAYMENT_BUTTON_EN =
  /\b(pay|pay\s+now|pay\s+securely|make\s+payment|submit\s+payment|proceed\s+to\s+pay|place\s+(the\s+|your\s+)?order|buy\s+now|buy\s+it\s+now|order\s+now|complete\s+(purchase|order|payment)|confirm\s+(and\s+pay|purchase|order|payment)|authori[sz]e\s+payment|checkout\s+now)\b/;
export const PAYMENT_BUTTON_HI =
  /भुगतान|पेमेंट|खरीद|ख़रीद|ऑर्डर|आर्डर|आदेश\s*दें|अभी\s*लें|भुगतान\s*करें/;

/**
 * Button text that moves a checkout from one step to the next.
 *
 * DECISION: this is the other half of `PAYMENT_BUTTON_EN`, and the split is the
 * whole point. "Proceed to Buy", "Continue", "Deliver to this address" move a
 * form wizard forward; they move zero paise. Refusing them handed the shopper
 * the wheel at the cart and made them drive the entire checkout by hand, which
 * is not protection — it is the agent quitting at the first door.
 *
 * DECISION: these are read *after* `PAYMENT_BUTTON_EN`, never instead of it
 * (see `FIELD_RULES` — action rules run before submit rules). So a label that
 * is in both tables is refused: "Buy Now" commits with a stored instrument on a
 * real shop, and it stays on the refused side no matter how progression-shaped
 * the word "buy" looks. Note there is deliberately no bare `buy` above, which
 * is why "Proceed to Buy" reaches this table at all.
 */
export const CHECKOUT_STEP_EN =
  /\b(proceed|continue|next(\s+step)?|save\s+and\s+(continue|deliver)|(deliver|ship|send)\s+to\s+this\s+address|deliver\s+here|use\s+this\s+address|(select|choose)\s+this\s+address|add\s+(a\s+)?(new\s+)?address|save\s+address|review\s+(your\s+)?order)\b/;
export const CHECKOUT_STEP_HI =
  /आगे\s*बढ़ें|जारी\s*रखें|अगला|इस\s*पते\s*पर|पता\s*सहेजें/;

/** One question, asked in both languages the tables above cover. */
export function isCheckoutStep(buttonText: string): boolean {
  return CHECKOUT_STEP_EN.test(buttonText) || CHECKOUT_STEP_HI.test(buttonText);
}

/**
 * Button text that signs you in or signs you up. Found by running the reader
 * against a real public shop: its sign-in page is served at the bare domain, so
 * every URL-scoped rule below saw nothing and the agent was free to press
 * "Login". A page can hide what it is in its URL; it cannot hide it in the
 * label on the button, because the label is what the human has to read too.
 *
 * `sign out` and `log out` are deliberately absent — leaving an account is not
 * entering one, and refusing it would strand the window signed in.
 */
export const AUTH_BUTTON_EN =
  /\b(log\s*in|sign\s*in|sign\s*up|register|create\s+(an\s+)?account|continue\s+with\s+(google|apple|facebook|github|email|phone))\b/;
export const AUTH_BUTTON_HI =
  /लॉग\s*इन|साइन\s*इन|साइन\s*अप|खाता\s*बनाएं|पंजीकरण/;

/**
 * Form-action and URL heuristics. Run against a URL squashed on `/?&=#._-` so
 * that `/checkout/pay` and `?step=payment` both become word-matchable.
 */
export const LOGIN_URL =
  /\b(login|log\s+in|signin|sign\s+in|auth|authenticate|session|sso|oauth|account\s+login)\b/;
export const REGISTER_URL =
  /\b(register|registration|signup|sign\s+up|create\s+account|new\s+account|onboarding|kyc)\b/;
export const PAYMENT_URL =
  /\b(checkout|payment|payments|pay|billing|card|upi|netbanking|net\s+banking|wallet|razorpay|paytm|gateway)\b/;
export const OTP_URL = /\b(otp|verify|verification|2fa|mfa|challenge)\b/;

export const CAPTCHA_MARKERS =
  /\b(captcha|recaptcha|hcaptcha|turnstile|are\s+you\s+(a\s+)?human|i\s+am\s+not\s+a\s+robot)\b/;

/** Squashes a URL into space-separated words so the patterns above can match. */
export function urlWords(value: string | null): string {
  if (value === null || value === "") {
    return "";
  }
  return scopeOf(value)
    .toLowerCase()
    .replace(/[/?&=#:.\-_+%,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A `file://` URL's ancestors are the machine's disk, not the site: a checkout
 * fixture living under a folder called `payments/` would otherwise mark every
 * page a payment page. Only the document and its own folder count. http(s) URLs
 * are matched whole, because there the host *is* part of the site's identity
 * (`checkout.example.com` is a checkout).
 */
function scopeOf(value: string): string {
  if (!/^(file:|[a-z]:[\\/])/i.test(value)) {
    return value;
  }
  const parts = value.split(/[\\/]+/).filter((part) => part !== "");
  return parts.slice(-2).join(" ");
}

const NUMERIC_TYPES = ["tel", "number"];
const NUMERIC_MODES = ["numeric", "tel", "decimal"];
const OTP_MAX_LENGTH = 8;

function isShortField(maxLength: number | null): boolean {
  return maxLength !== null && maxLength > 0 && maxLength <= OTP_MAX_LENGTH;
}

function isNumericField(
  inputType: string | null,
  inputMode: string | null,
  pattern: string | null,
): boolean {
  if (NUMERIC_TYPES.includes((inputType ?? "").toLowerCase())) return true;
  if (NUMERIC_MODES.includes((inputMode ?? "").toLowerCase())) return true;
  return /\\?d/.test(pattern ?? "");
}

/** True when the field is short and numeric enough to be a one-time code. */
export function looksLikeShortNumeric(
  maxLength: number | null,
  inputType: string | null,
  inputMode: string | null,
  pattern: string | null,
): boolean {
  return (
    isShortField(maxLength) && isNumericField(inputType, inputMode, pattern)
  );
}
