import { CHECK_IDS, TIER_LABELS, VERDICT_OUTCOMES } from "@covenant/domain";
import { z } from "zod";

/**
 * The shared wire primitives of §4.3. Every **request** schema built on them is
 * strict: an unknown key is a rejection, not an ignore — AM5 applied to the
 * transport as well as to `risk_data`.
 */
export const uuid = z.uuid();
export const jti = z.string().regex(/^urn:uuid:[0-9a-f-]{36}$/);
export const sha256Ref = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const rfc3339 = z.iso.datetime({ offset: true });
export const paise = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const currency = z.string().length(3).regex(/^[A-Z]{3}$/);
export const compactJws = z
  .string()
  .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

/**
 * Tier crosses the wire as the label `"P0".."P3"`, never as an integer: it is a
 * provenance *label*, not a magnitude, and an integer invites arithmetic on it.
 * Storage and scoring keep the rank; the mapping lives in `domain`.
 */
export const tier = z.enum(TIER_LABELS);

/** Decoupled from the class name on purpose — this is `SealProps.check` (§4.3). */
export const checkId = z.enum(CHECK_IDS);

export const toPass = z.record(z.string(), z.unknown()).nullable();

export const verdictSchema = z.strictObject({
  check: checkId,
  outcome: z.enum(VERDICT_OUTCOMES),
  reason_code: z.string().nullable(),
  human: z.string().nullable(),
  to_pass: toPass,
  ms: z.number().nonnegative(),
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
    request_id: uuid,
    ts: rfc3339,
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelope>;
export type VerdictWire = z.infer<typeof verdictSchema>;
