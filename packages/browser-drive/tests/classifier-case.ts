import type {
  ElementDescriptor,
  SensitiveCategory,
} from "../src/field/element-descriptor.js";
import type { HandoffReason } from "../src/session-state.js";
import { el } from "./fakes.js";

export interface Case {
  readonly name: string;
  readonly descriptor: ElementDescriptor;
  /** `null` means the agent is allowed to act on it. */
  readonly category: SensitiveCategory | null;
  readonly handoff: HandoffReason | null;
}

/** Page URLs whose *scope* the context rules read. */
export const SHOP = "https://bazaar.example/products/trailfoot-runner";
export const LOGIN = "https://bazaar.example/account/login";
export const REG = "https://bazaar.example/account/register";
export const PAY = "https://bazaar.example/checkout/payment";
export const VERIFY = "https://bazaar.example/account/verify";

export function c(
  name: string,
  overrides: Partial<ElementDescriptor>,
  category: SensitiveCategory | null,
  handoff: HandoffReason | null = null,
): Case {
  return {
    name,
    descriptor: el({ pageUrl: SHOP, ...overrides }),
    category,
    handoff,
  };
}

/** A `<button>`; `text` is what the payment-button rule reads. */
export function b(
  name: string,
  text: string,
  overrides: Partial<ElementDescriptor>,
  category: SensitiveCategory | null,
  handoff: HandoffReason | null = null,
): Case {
  return c(name, { tag: "button", inputType: null, text, ...overrides }, category, handoff);
}

/** An `<a>`: activatable, but never a submit control. */
export function link(
  name: string,
  text: string,
  overrides: Partial<ElementDescriptor>,
  category: SensitiveCategory | null,
  handoff: HandoffReason | null = null,
): Case {
  return c(name, { tag: "a", inputType: null, text, ...overrides }, category, handoff);
}
