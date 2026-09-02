// The text-entry tables: what the agent may never type into.
//
// Order in this file IS the policy, and it runs in three bands:
//   1. DECLARED — the page states the semantic itself (type=password,
//      autocomplete=cc-number). Unambiguous, so nothing overrides it.
//   2. NAMED — name/label/placeholder heuristics, most specific first. This is
//      why "Card security code" is a CVV while a bare "Security code" is an OTP,
//      and why "One time password" is an OTP rather than a password.
//   3. SHAPE — the weakest signal (a short numeric box near verification text),
//      last so it never outranks a field that identified itself.
import type { HandoffReason } from "../session-state.js";
import type {
  ElementDescriptor,
  SensitiveCategory,
} from "./element-descriptor.js";
import { isTextEntry } from "./element-descriptor.js";
import * as P from "./patterns.js";

export interface RuleContext {
  /** name/id/autocomplete/placeholder/aria-label/label, squashed. */
  readonly words: string;
  /** `words` plus the surrounding node text and the element's own text. */
  readonly context: string;
  readonly buttonText: string;
  /** Form action and page URL, squashed into matchable words. */
  readonly scope: string;
}

export interface FieldRule {
  readonly id: string;
  readonly category: SensitiveCategory;
  /** `null` refuses without moving the wheel: a lone commit button on an
   *  ordinary page is not the step it commits. The page-level detectors in
   *  web-handover own the real handoffs. */
  readonly handoff: HandoffReason | null;
  /** When the surrounding scope is a sign-up flow, `handoff` becomes account-creation. */
  readonly authScoped: boolean;
  readonly human: string;
  matches(descriptor: ElementDescriptor, context: RuleContext): boolean;
}

export function entry(
  id: string,
  category: SensitiveCategory,
  handoff: HandoffReason,
  human: string,
  matches: (d: ElementDescriptor, c: RuleContext) => boolean,
  authScoped = false,
): FieldRule {
  return {
    id,
    category,
    handoff,
    authScoped,
    human,
    matches: (d, c) => isTextEntry(d) && matches(d, c),
  };
}

/** Band 1: the page's own declaration of what the field holds. */
export const DECLARED_RULES: readonly FieldRule[] = [
  entry(
    "password_input_type",
    "password",
    "login",
    "That is a password field. The agent never types a credential — you type it in the window you can see.",
    (d) => (d.inputType ?? "").toLowerCase() === "password",
    true,
  ),
  entry(
    "password_autocomplete",
    "password",
    "login",
    "That field is declared as a password by the page itself. You type it, not the agent.",
    (_d, c) => P.PASSWORD_AUTOCOMPLETE.test(c.words),
    true,
  ),
  entry(
    "otp_autocomplete",
    "otp",
    "otp",
    "That is a one-time code field. The code was sent to you, so only you can enter it.",
    (_d, c) => P.OTP_AUTOCOMPLETE.test(c.words),
  ),
  entry(
    "card_autocomplete",
    "card",
    "payment",
    "The page declares that field as card data. The agent never touches card data.",
    (_d, c) => P.CARD_AUTOCOMPLETE.test(c.words),
  ),
];

/** Band 2: naming heuristics, most specific first. */
export const NAMED_RULES: readonly FieldRule[] = [
  entry(
    "cvv_named",
    "cvv",
    "payment",
    "That is a card security code. The agent never touches card data.",
    (_d, c) => P.CVV_NAMED.test(c.words),
  ),
  entry(
    "card_named",
    "card",
    "payment",
    "That field is named like card data. You enter it in the window you can see.",
    (_d, c) => P.CARD_NAMED.test(c.words),
  ),
  entry(
    "otp_named",
    "otp",
    "otp",
    "That field asks for a one-time code. The agent hands this back to you.",
    (_d, c) => P.OTP_NAMED.test(c.words),
  ),
  entry(
    "password_named",
    "password",
    "login",
    "That field is named like a password. The agent will not type it.",
    (_d, c) => P.PASSWORD_NAMED.test(c.words),
    true,
  ),
  entry(
    "upi_pin_named",
    "upi_pin",
    "payment",
    "A UPI or ATM PIN is yours alone. The agent will not type it under any instruction.",
    (_d, c) => P.UPI_PIN_NAMED.test(c.words),
  ),
  entry(
    "upi_vpa_named",
    "upi_vpa",
    "payment",
    "That field is a payment address. The agent leaves every payment identifier to you.",
    (_d, c) => P.UPI_VPA_NAMED.test(c.words),
  ),
  entry(
    "aadhaar_named",
    "aadhaar",
    "account-creation",
    "That field asks for an Aadhaar or UIDAI number. The agent never enters a government identifier.",
    (_d, c) => P.AADHAAR_NAMED.test(c.words),
  ),
  entry(
    "bank_account_named",
    "bank_account",
    "payment",
    "That field is bank account detail. The agent never enters it.",
    (_d, c) => P.BANK_ACCOUNT_NAMED.test(c.words),
  ),
];

/** Band 3: shape alone, the weakest signal and therefore the last word. */
export const SHAPE_RULES: readonly FieldRule[] = [
  entry(
    "otp_short_numeric",
    "otp",
    "otp",
    "A short numeric field next to verification text reads as a one-time code, so the agent stops here.",
    (d, c) =>
      P.looksLikeShortNumeric(
        d.maxLength,
        d.inputType,
        d.inputMode,
        d.pattern,
      ) && P.OTP_WEAK.test(c.context),
  ),
];

export const ENTRY_RULES: readonly FieldRule[] = [
  ...DECLARED_RULES,
  ...NAMED_RULES,
  ...SHAPE_RULES,
];
