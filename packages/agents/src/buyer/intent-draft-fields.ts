import type {
  Clock,
  CooloffRule,
  CreditPolicy,
  IntentBounds,
} from "@covenant/domain";
import { z } from "zod";

const envelopeSchema = z.strictObject({
  category: z.string().min(1),
  period: z.enum(["day", "week", "month"]),
  cap_paise: z.number().int().positive(),
});

/**
 * What the sealed prompt may return: labelled data, never instructions.
 *
 * DECISION: the currency and the ceiling are **schema literals**, built from
 * the covenant's own configuration rather than left to the model. A draft
 * denominated in a currency this covenant does not hold, or capped at zero, or
 * naming nothing to buy, is not a tighter intent or a looser one: it is not an
 * intent. It is rejected here, before signing, on every model the router might
 * have picked and however confidently that model answered.
 *
 * `merchants` and `skus` are required and non-empty for the same reason. An
 * allowance that names no merchant and no SKU is unbounded in the two
 * dimensions that matter most, and a greeting cannot produce either, which is
 * what stops "hi" from becoming something a human is asked to sign.
 */
export function draftSchemaFor(
  currency: string,
  maxAmountPaise: number,
): z.ZodType<IntentDraftFields> {
  return z.strictObject({
    natural_language_description: z.string().min(1).max(400),
    max_amount_paise: z.number().int().positive().max(maxAmountPaise),
    currency: z.literal(currency),
    merchants: z.array(z.string().min(1)).min(1),
    skus: z.array(z.string().min(1)).min(1),
    requires_refundability: z.boolean(),
    envelopes: z.array(envelopeSchema),
  });
}

export interface IntentDraftFields {
  readonly natural_language_description: string;
  readonly max_amount_paise: number;
  readonly currency: string;
  readonly merchants: readonly string[];
  readonly skus: readonly string[];
  readonly requires_refundability: boolean;
  readonly envelopes: readonly z.infer<typeof envelopeSchema>[];
}

export interface IntentDraftDefaults {
  /** The denomination of the allowance. A literal in the schema, not a hint. */
  readonly currency: string;
  /** The ceiling the drafted allowance may not exceed, in minor units. */
  readonly maxAmountPaise: number;
  readonly ttlSeconds: number;
  readonly cooloff: CooloffRule | null;
  readonly creditPolicy: CreditPolicy;
  readonly humanPresent: boolean;
  readonly userCartConfirmationRequired: boolean;
  readonly shareAggregates: boolean;
  readonly judgeTimeoutMs: number;
}

export interface IntentDraftRequest {
  readonly conversation: readonly string[];
  readonly userIss: string;
  readonly tenantId: string;
  readonly agentInstanceId: string;
}

export interface IntentDraft {
  readonly naturalLanguageDescription: string;
  readonly bounds: IntentBounds;
}

/** When a draft made now would lapse. */
export function expiryAt(clock: Clock, ttlSeconds: number): string {
  const ms = clock.now().getTime() + ttlSeconds * 1000;
  return new Date(ms).toISOString();
}
