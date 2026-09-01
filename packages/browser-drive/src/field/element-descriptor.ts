import type { HandoffReason } from "../session-state.js";

/**
 * A flat, serializable snapshot of one element. The classifier is pure over
 * this shape, which is why it can be table-tested exhaustively without a
 * browser — the DOM read and the security decision are different jobs.
 */
export interface ElementDescriptor {
  readonly selector: string;
  readonly tag: string;
  readonly inputType: string | null;
  readonly name: string | null;
  readonly id: string | null;
  readonly autocomplete: string | null;
  readonly placeholder: string | null;
  readonly ariaLabel: string | null;
  readonly labelText: string | null;
  readonly nearbyText: string | null;
  readonly inputMode: string | null;
  readonly pattern: string | null;
  readonly maxLength: number | null;
  readonly text: string | null;
  readonly formAction: string | null;
  readonly pageUrl: string;
}

export type SensitiveCategory =
  | "password"
  | "otp"
  | "card"
  | "cvv"
  | "aadhaar"
  | "upi_pin"
  | "upi_vpa"
  | "bank_account"
  | "login_context"
  | "payment_context"
  | "payment_button";

export interface Classification {
  readonly sensitive: boolean;
  readonly category: SensitiveCategory | null;
  /** The rule id that fired — the journal records this, not a boolean. */
  readonly rule: string;
  readonly handoff: HandoffReason | null;
  readonly human: string;
}

export const ALLOWED: Classification = {
  sensitive: false,
  category: null,
  rule: "no_rule_matched",
  handoff: null,
  human: "",
};

/** Everything the classifier reads as free text, lowercased and collapsed. */
export function textOf(descriptor: ElementDescriptor): string {
  const parts = [
    descriptor.name,
    descriptor.id,
    descriptor.autocomplete,
    descriptor.placeholder,
    descriptor.ariaLabel,
    descriptor.labelText,
  ];
  return normalize(parts.join(" "));
}

/** Label text plus the surrounding node — the "near" in "numeric near otp". */
export function contextTextOf(descriptor: ElementDescriptor): string {
  return normalize(
    [textOf(descriptor), descriptor.nearbyText, descriptor.text].join(" "),
  );
}

export function normalize(value: string | null): string {
  if (value === null) {
    return "";
  }
  return value
    .replace(/\u00A0/g, " ")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Untouched by the punctuation squash — Devanagari and URLs need the raw form. */
export function rawTextOf(value: string | null): string {
  if (value === null) {
    return "";
  }
  return value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isTextEntry(descriptor: ElementDescriptor): boolean {
  if (descriptor.tag === "textarea") {
    return true;
  }
  if (descriptor.tag !== "input") {
    return descriptor.tag === "div" && descriptor.pattern !== null;
  }
  const type = normalize(descriptor.inputType);
  return !["submit", "button", "reset", "checkbox", "radio", "file"].includes(
    type,
  );
}

export function isActivatable(descriptor: ElementDescriptor): boolean {
  if (["button", "a"].includes(descriptor.tag)) {
    return true;
  }
  return isSubmitControl(descriptor);
}

/**
 * A button, not a link. Pressing one of these inside an auth or checkout form
 * *completes* that flow, so the distinction carries policy: the agent may
 * follow a link out of a login page, and may not submit the login page.
 */
export function isSubmitControl(descriptor: ElementDescriptor): boolean {
  if (descriptor.tag === "button") {
    return true;
  }
  return (
    descriptor.tag === "input" &&
    ["submit", "button", "image"].includes(normalize(descriptor.inputType))
  );
}
