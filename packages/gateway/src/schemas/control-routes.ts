import { z } from "zod";

import { compactJws, rfc3339 } from "./common.js";

export const covenantSignRequest = z.strictObject({
  intent_mandate_jwt: compactJws,
  tenant_id: z.string(),
});

export const covenantSignResponse = z.strictObject({
  ok: z.literal(true),
  mandate_id: z.string(),
  committed_constraints: z.array(z.string()),
  event_id: z.string(),
});

/** `:id` is the **hold id**, which is the cart mandate `jti` — not the txn id. */
export const cooloffActionRequest = z.strictObject({
  reason: z.enum(["user_cancelled", "undo"]),
  tenant_id: z.string(),
});

export const cooloffActionResponse = z.strictObject({
  ok: z.literal(true),
  hold_id: z.string(),
  txn_id: z.string(),
  state: z.enum(["cancelled", "pending_cooloff"]),
  /** The 5 s undo window on a cancel; `null` on a restore. */
  restore_deadline: rfc3339.nullable(),
  event_id: z.string(),
});

/**
 * Razorpay owns this shape, so only the fields we read are pinned and the rest
 * passes through (§4.4). The signature is checked over the **raw bytes** before
 * this parse ever runs (§4.8).
 */
export const webhookRequest = z.looseObject({
  entity: z.literal("event"),
  event: z.enum([
    "payment.captured",
    "payment.failed",
    "payment_link.paid",
    "order.paid",
  ]),
  created_at: z.number().int(),
  payload: z.record(z.string(), z.unknown()),
});

export const webhookResponse = z.strictObject({
  ok: z.literal(true),
  applied: z.boolean(),
  reason: z.string().nullable(),
});

export type CovenantSignRequest = z.infer<typeof covenantSignRequest>;
export type CovenantSignResponse = z.infer<typeof covenantSignResponse>;
export type CooloffActionRequest = z.infer<typeof cooloffActionRequest>;
export type CooloffActionResponse = z.infer<typeof cooloffActionResponse>;
export type WebhookRequest = z.infer<typeof webhookRequest>;
export type WebhookResponse = z.infer<typeof webhookResponse>;
