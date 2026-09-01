import type { CovenantVerdict } from "../cart/cart-covenant.js";
import type {
  Classification,
  SensitiveCategory,
} from "../field/element-descriptor.js";
import type { Handoff, HandoffReason } from "../session-state.js";

export type RefusalReason =
  | "sensitive_field"
  | "payment_button"
  | "restricted_context"
  | "element_missing"
  | "navigation_blocked"
  | "covenant_violation";

export interface Refusal {
  readonly ok: false;
  readonly reason: RefusalReason;
  readonly category: SensitiveCategory | null;
  /** The classifier rule id, so a block is auditable rather than mysterious. */
  readonly rule: string;
  readonly human: string;
  /** Present when the block also moved the wheel to the user. */
  readonly handoff: Handoff | null;
  readonly handoffReason: HandoffReason | null;
}

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Blocks are values, not exceptions. A refusal is the system working (§7.2), and
 * the session has to be able to read it and say it out loud — the same reason
 * `AgentToolDispatcher` returns rejected writes as tool errors instead of throws.
 */
export type ActionResult<T> = Success<T> | Refusal;

export function ok<T>(value: T): Success<T> {
  return { ok: true, value };
}

export function missing(selector: string): Refusal {
  return {
    ok: false,
    reason: "element_missing",
    category: null,
    rule: "element_not_found",
    human: `Nothing on this page matches ${selector}, so the agent did nothing.`,
    handoff: null,
    handoffReason: null,
  };
}

export function navigationRefusal(rule: string, human: string): Refusal {
  return {
    ok: false,
    reason: "navigation_blocked",
    category: null,
    rule,
    human,
    handoff: null,
    handoffReason: null,
  };
}

export function covenantRefusal(verdict: CovenantVerdict): Refusal {
  return {
    ok: false,
    reason: "covenant_violation",
    category: null,
    rule: `covenant_${verdict.outcome}`,
    human: verdict.human,
    handoff: null,
    handoffReason: null,
  };
}

const RESTRICTED_CONTEXTS = ["login_context", "payment_context"];

/** Which of the three refusal shapes a classifier verdict comes back as. */
export function reasonFor(verdict: Classification): RefusalReason {
  if (verdict.category === "payment_button") return "payment_button";
  return RESTRICTED_CONTEXTS.includes(verdict.category ?? "")
    ? "restricted_context"
    : "sensitive_field";
}

export interface NavigationOutcome {
  readonly url: string;
  /** Non-null when the destination is a context the agent may read, not touch. */
  readonly flagged: HandoffReason | null;
}
