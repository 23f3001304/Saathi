import { z } from "zod";

/**
 * DECISION (§2.7): these schemas are declared here rather than imported from
 * `packages/gateway`. The gateway is an independent trust context — sharing
 * types would smuggle a trust assumption across the boundary, and an agent
 * that parses a response with the server's own parser has not checked
 * anything. The §4 HTTP contract is the shared artifact; a contract test
 * asserts the two declarations agree.
 */
const sha256Ref = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const rfc3339 = z.iso.datetime({ offset: true });
const paise = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const currency = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/);
const compactJws = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
const tierLabel = z.enum(["P0", "P1", "P2", "P3"]);
const toPass = z.record(z.string(), z.unknown()).nullable();

export const CHECK_ID_VALUES = [
  "intent_bounds",
  "nonce",
  "uri_pin",
  "risk_data",
  "memory_digest",
  "quote_match",
  "envelope",
  "cooloff",
] as const;

export const verdictSchema = z.strictObject({
  check: z.enum(CHECK_ID_VALUES),
  outcome: z.enum(["pass", "hold", "fail"]),
  reason_code: z.string().nullable(),
  human: z.string().nullable(),
  to_pass: toPass,
  ms: z.number().nonnegative(),
});

/**
 * Zero seals or all eight. §8.1's stage-0 rejections (`MANDATE_MALFORMED`,
 * `SIGNATURE_INVALID`) answer before the pipeline runs and cannot carry eight
 * results; a flat `.length(8)` would make the client reject a well-formed
 * gateway rejection, which is the failure mode this whole layer exists to stop.
 */
const SEAL_COUNTS: readonly number[] = [0, CHECK_ID_VALUES.length];

const verdictList = z
  .array(verdictSchema)
  .refine((list) => SEAL_COUNTS.includes(list.length), {
    message: "the pipeline stamps either zero seals or all eight",
  });

/**
 * Both mandate fields are nullable and independent: a supervised approve
 * carries the issued mandate *and* the draft the user still has to authorize
 * (§6.5), so neither implies the other's absence.
 */
export const verifyCartResponse = z.strictObject({
  ok: z.literal(true),
  decision: z.enum(["approve", "hold", "reject"]),
  verdicts: verdictList,
  txn_id: z.string(),
  payment_mandate_jwt: compactJws.nullable(),
  payment_mandate_draft: compactJws.nullable(),
  hold: z
    .strictObject({
      hold_id: z.string(),
      until: rfc3339,
      seconds: z.number().int().positive(),
      cancel_url: z.string(),
    })
    .nullable(),
  reason_code: z.string().nullable(),
  human: z.string().nullable(),
  to_pass: toPass,
});

export const executePaymentResponse = z.strictObject({
  ok: z.literal(true),
  txn_id: z.string(),
  rzp_order_id: z.string(),
  // Mirrors the gateway's own schema: a refused link mint leaves the order
  // payable, so `null` here is a bill with no link, not a failed purchase.
  payment_link: z.url().nullable(),
  amount: paise,
  currency,
  state: z.enum(["link_issued", "captured"]),
});

export const memoryWriteResponse = z.strictObject({
  ok: z.literal(true),
  status: z.enum(["committed", "shadowed", "quarantined", "rejected"]),
  memory_id: z.string().nullable(),
  tier_granted: tierLabel.nullable(),
  deduped: z.boolean(),
  superseded: z.array(z.string()),
  reason_code: z.string().nullable(),
  human: z.string().nullable(),
  to_pass: toPass,
  rule: z.string().nullable(),
  event_id: z.string(),
});

export const memoryEntryView = z.strictObject({
  id: z.string(),
  type: z.string(),
  tier: tierLabel,
  quarantined: z.boolean(),
  subject: z.string().nullable(),
  predicate: z.string().nullable(),
  content: z.record(z.string(), z.unknown()),
  hash: z.string(),
  source_channel: z.string(),
  t_valid: rfc3339,
  t_invalid: rfc3339.nullable(),
  t_created: rfc3339,
  t_expired: rfc3339.nullable(),
  decay_weight: z.number(),
  score: z.number(),
});

export const memoryRetrieveResponse = z.strictObject({
  ok: z.literal(true),
  action_class: z.string(),
  entries: z.array(memoryEntryView),
  digest: sha256Ref.nullable(),
  digest_alg: z.literal("covenant-md-1"),
  tier_floor: tierLabel,
});

export const covenantSignResponse = z.strictObject({
  ok: z.literal(true),
  mandate_id: z.string(),
  committed_constraints: z.array(z.string()),
  event_id: z.string(),
});

export const errorEnvelope = z.strictObject({
  ok: z.literal(false),
  error: z.strictObject({
    type: z.enum([
      "invalid_request",
      "invalid_card",
      "idempotency_conflict",
      "rate_limit_exceeded",
      "processing_error",
      "service_unavailable",
    ]),
    reason_code: z.string(),
    human: z.string(),
    to_pass: toPass,
    request_id: z.uuid(),
    ts: rfc3339,
  }),
});

export type VerdictWire = z.infer<typeof verdictSchema>;
export type VerifyCartResponse = z.infer<typeof verifyCartResponse>;
export type ExecutePaymentResponse = z.infer<typeof executePaymentResponse>;
export type MemoryWriteResponse = z.infer<typeof memoryWriteResponse>;
export type MemoryEntryWire = z.infer<typeof memoryEntryView>;
export type MemoryRetrieveResponse = z.infer<typeof memoryRetrieveResponse>;
export type CovenantSignResponse = z.infer<typeof covenantSignResponse>;
export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
