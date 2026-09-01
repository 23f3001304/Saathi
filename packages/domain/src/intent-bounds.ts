import type { CartLine } from "./cart.js";
import { declaresRefundPolicy } from "./cart.js";
import type { EnvelopeDeclaration } from "./envelope.js";
import type { IsoTimestamp } from "./iso-timestamp.js";
import { isBefore } from "./iso-timestamp.js";
import type { Money } from "./money.js";
import type { PaymentRequest } from "./payment-request.js";

/** ACP allowance object, adopted field-for-field (§A.1, §6.2). */
export interface IntentAllowance {
  readonly reason: "one_time";
  /** Integer minor units (paise). */
  readonly max_amount: number;
  readonly currency: string;
  readonly expires_at: IsoTimestamp;
  readonly merchant_id: string | null;
  readonly checkout_session_id: string | null;
}

export interface CooloffRule {
  readonly threshold_paise: number;
  readonly hold_seconds: number;
}

/** Declared as local wall-clock hours; resolved to instants by the gateway. */
export interface BlackoutHours {
  readonly tz: string;
  readonly from: string;
  readonly to: string;
}

export interface BlackoutWindow {
  readonly starts_at: IsoTimestamp;
  readonly ends_at: IsoTimestamp;
}

export interface CreditPolicy {
  readonly allow_credit: boolean;
  readonly max_apr_bps: number;
}

/**
 * Everything in the Intent Mandate that bounds spending (§6.2). Every field
 * here becomes a P3 `constraint` memory entry at `POST /covenant/sign` — the
 * only way a constraint can be created (§9.2).
 */
export interface IntentBounds {
  readonly allowance: IntentAllowance;
  /** `null` = any merchant. */
  readonly merchants: readonly string[] | null;
  /** `null` = any sku. */
  readonly skus: readonly string[] | null;
  readonly requires_refundability: boolean;
  readonly user_cart_confirmation_required: boolean;
  readonly human_present: boolean;
  readonly intent_expiry: IsoTimestamp;
  readonly envelopes: readonly EnvelopeDeclaration[];
  readonly cooloff: CooloffRule | null;
  readonly blackout_hours: BlackoutHours | null;
  readonly credit_policy: CreditPolicy;
  readonly share_aggregates: boolean;
}

// The seven predicates of §8.4 check 1, in pipeline order.

export function withinCap(bounds: IntentBounds, total: Money): boolean {
  return total.paise <= bounds.allowance.max_amount;
}

export function currencyMatches(bounds: IntentBounds, total: Money): boolean {
  return total.currency === bounds.allowance.currency;
}

/** The earliest of the JWT `exp`, the allowance expiry and `intent_expiry`. */
export function effectiveExpiry(
  bounds: IntentBounds,
  jwtExpiry: IsoTimestamp,
): IsoTimestamp {
  const earliest = Math.min(
    Date.parse(jwtExpiry),
    Date.parse(bounds.allowance.expires_at),
    Date.parse(bounds.intent_expiry),
  );
  return new Date(earliest).toISOString();
}

export function notExpired(
  bounds: IntentBounds,
  jwtExpiry: IsoTimestamp,
  now: IsoTimestamp,
): boolean {
  return isBefore(now, effectiveExpiry(bounds, jwtExpiry));
}

export function merchantAllowed(
  bounds: IntentBounds,
  merchantId: string,
): boolean {
  return bounds.merchants === null || bounds.merchants.includes(merchantId);
}

export function skusAllowed(
  bounds: IntentBounds,
  lines: readonly CartLine[],
): boolean {
  const allowed = bounds.skus;
  return allowed === null || lines.every((line) => allowed.includes(line.sku));
}

export function refundabilitySatisfied(
  bounds: IntentBounds,
  request: PaymentRequest,
): boolean {
  return !bounds.requires_refundability || declaresRefundPolicy(request);
}

/**
 * HNP is admitted only for a user-signed intent that waived cart confirmation
 * (§6.5); otherwise the AP2 invariant fails closed as `CONFIRMATION_REQUIRED`.
 */
export function confirmationSatisfied(
  bounds: IntentBounds,
  userSigned: boolean,
): boolean {
  return (
    bounds.human_present ||
    (userSigned && !bounds.user_cart_confirmation_required)
  );
}
