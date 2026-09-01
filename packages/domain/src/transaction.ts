import type { IsoTimestamp } from "./iso-timestamp.js";

export const TRANSACTION_STATES = [
  "pending_cooloff",
  "approved",
  "link_issued",
  "captured",
  "failed",
  "cancelled",
  "parked",
] as const;

export type TransactionState = (typeof TRANSACTION_STATES)[number];

export interface Transaction {
  readonly id: string;
  readonly tenant_id: string;
  readonly user_id: string;
  readonly cart_mandate_id: string;
  readonly payment_mandate_id: string | null;
  readonly rzp_order_id: string | null;
  readonly rzp_payment_link_id: string | null;
  readonly rzp_payment_id: string | null;
  readonly amount_paise: number;
  readonly currency: string;
  readonly state: TransactionState;
  readonly cooloff_until: IsoTimestamp | null;
  /** Bounds the 5 s restore window (§5.2 e). */
  readonly cancelled_at: IsoTimestamp | null;
  readonly last_event_seq: number;
}

/**
 * The legal moves of §3.7, mirrored by the DDL CHECK. `cancelled` →
 * `pending_cooloff` is the 5 s undo, and it is the only backwards edge.
 */
export const TRANSACTION_TRANSITIONS: Record<
  TransactionState,
  readonly TransactionState[]
> = {
  approved: ["link_issued", "pending_cooloff"],
  pending_cooloff: ["approved", "cancelled"],
  link_issued: ["captured", "failed"],
  failed: ["parked"],
  captured: [],
  cancelled: ["pending_cooloff"],
  parked: [],
};

/** The undo window on a cool-off cancel (§5.2 e). */
export const CANCEL_RESTORE_SECONDS = 5;

/**
 * Once here, a late cancel is answered truthfully with
 * `TXN_ALREADY_FINALIZED` rather than accepted and then contradicted by a
 * webhook (decision 28).
 */
export const FINAL_TRANSACTION_STATES: readonly TransactionState[] = [
  "captured",
  "parked",
];

export function canTransition(
  from: TransactionState,
  to: TransactionState,
): boolean {
  return TRANSACTION_TRANSITIONS[from].includes(to);
}

export function isFinal(state: TransactionState): boolean {
  return FINAL_TRANSACTION_STATES.includes(state);
}
