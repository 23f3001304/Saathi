import { ACTION_CLASSES, MEMORY_TYPES, SOURCE_CHANNELS, TIER_LABELS } from "@covenant/domain";
import { z } from "zod";

/**
 * The tool arguments as they arrive from a session — scripted or sampled — are
 * untrusted input, so they are parsed at the dispatcher rather than cast. A
 * model that invents a `tier_claim` of `"P9"` gets a tool error, not a throw
 * three layers down inside the gateway client.
 */
export const catalogArgs = z.object({
  query: z.string().default(""),
  max_price_paise: z.number().int().positive().nullable().default(null),
  limit: z.number().int().min(1).max(50).default(8),
});

export const quoteArgs = z.object({
  sku: z.string().min(1),
  qty: z.number().int().min(1).default(1),
  target_unit_paise: z.number().int().positive().nullable().default(null),
});

/**
 * `user_id`, `tenant_id` and `t_valid` are deliberately absent: they are the
 * host's identity and its clock, not the model's opinion, and a tool surface
 * that accepted them would let a prompt file a memory under another user.
 */
export const memoryWriteArgs = z.object({
  type: z.enum(MEMORY_TYPES),
  tier_claim: z.enum(TIER_LABELS),
  source_channel: z.enum(SOURCE_CHANNELS),
  sig: z.string().nullable().default(null),
  subject: z.string().nullable().default(null),
  predicate: z.string().nullable().default(null),
  source_ref: z.string().nullable().default(null),
  content: z.record(z.string(), z.unknown()),
});

export const memoryRetrieveArgs = z.object({
  query: z.string().min(1).max(2000),
  action_class: z.enum(ACTION_CLASSES).default("chat"),
  limit: z.number().int().min(1).max(200).default(12),
});

export type CatalogArgs = z.infer<typeof catalogArgs>;
export type QuoteArgs = z.infer<typeof quoteArgs>;
export type MemoryWriteArgs = z.infer<typeof memoryWriteArgs>;
export type MemoryRetrieveArgs = z.infer<typeof memoryRetrieveArgs>;
