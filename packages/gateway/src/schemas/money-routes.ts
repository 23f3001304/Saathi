import { CHECK_IDS } from "@covenant/domain";
import { z } from "zod";

import {
  compactJws,
  currency,
  paise,
  rfc3339,
  toPass,
  verdictSchema,
} from "./common.js";

/**
 * DECISION: `verdicts` is "0 or 8", not §4.4's flat `.length(8)`. Why: §8.1
 * requires a stage-0 rejection (`MANDATE_MALFORMED`, `SIGNATURE_INVALID`,
 * `SIGNER_UNKNOWN`) to answer with **zero** seals, which `.length(8)` makes
 * unrepresentable. Encoding both legal shapes keeps the "eight seals, always"
 * invariant enforceable for every request that reaches the pipeline instead of
 * relaxing it to `.max(8)`.
 */
const SEAL_COUNTS: readonly number[] = [0, CHECK_IDS.length];

const verdictList = z
  .array(verdictSchema)
  .refine((list) => SEAL_COUNTS.includes(list.length), {
    message: "the pipeline stamps either zero seals (stage 0) or all eight",
  });

// The intent is presented, not fetched: the gateway pins nothing it did not see.
export const verifyCartRequest = z.strictObject({
  cart_mandate_jwt: compactJws,
  intent_mandate_jwt: compactJws,
  memory_entry_ids: z.array(z.string()).min(1).max(64),
  tenant_id: z.string().min(1),
});

export const holdBlock = z.strictObject({
  hold_id: z.string(),
  until: rfc3339,
  seconds: z.number().int().positive(),
  cancel_url: z.string(),
});

export const verifyCartResponse = z.strictObject({
  ok: z.literal(true),
  decision: z.enum(["approve", "hold", "reject"]),
  verdicts: verdictList,
  txn_id: z.string(),
  /** Present iff `decision === 'approve'`. */
  payment_mandate_jwt: compactJws.nullable(),
  /** Present iff a `user_authorization` is still required (§6.5). */
  payment_mandate_draft: compactJws.nullable(),
  hold: holdBlock.nullable(),
  reason_code: z.string().nullable(),
  human: z.string().nullable(),
  to_pass: toPass,
});

export const executePaymentRequest = z.strictObject({
  payment_mandate_jwt: compactJws,
  tenant_id: z.string().min(1),
});

export const executePaymentResponse = z.strictObject({
  ok: z.literal(true),
  txn_id: z.string(),
  rzp_order_id: z.string(),
  // Nullable because the order and the link are two separate rail calls and
  // only the first one is required to have a payable outcome: when the link
  // mint is refused (a test account's link quota, say) the order still exists
  // and checkout can still be opened on it. `null` says "no link", not "no
  // way to pay".
  payment_link: z.url().nullable(),
  amount: paise,
  currency,
  state: z.enum(["link_issued", "captured"]),
});

export type VerifyCartRequest = z.infer<typeof verifyCartRequest>;
export type VerifyCartResponse = z.infer<typeof verifyCartResponse>;
export type ExecutePaymentRequest = z.infer<typeof executePaymentRequest>;
export type ExecutePaymentResponse = z.infer<typeof executePaymentResponse>;
export type HoldBlock = z.infer<typeof holdBlock>;
