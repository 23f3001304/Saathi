import {
  ACTION_CLASSES,
  MEMORY_DIGEST_ALG,
  MEMORY_TYPES,
  MEMORY_WRITE_STATUSES,
  SOURCE_CHANNELS,
} from "@covenant/domain";
import { z } from "zod";

import { compactJws, rfc3339, sha256Ref, tier, toPass } from "./common.js";

/** `tier_claim` is a CLAIM; the gate derives the real tier from the channel. */
export const memoryWriteRequest = z.strictObject({
  type: z.enum(MEMORY_TYPES),
  tier_claim: tier,
  content: z.record(z.string(), z.unknown()),
  source_channel: z.enum(SOURCE_CHANNELS),
  source_ref: z.string().nullable(),
  /** Required for the three signed channels; the gate, not zod, decides that. */
  sig: compactJws.nullable(),
  subject: z.string().nullable(),
  predicate: z.string().nullable(),
  t_valid: rfc3339,
  t_invalid: rfc3339.nullable(),
  user_id: z.string(),
  tenant_id: z.string(),
});

export const memoryWriteResponse = z.strictObject({
  ok: z.literal(true),
  status: z.enum(MEMORY_WRITE_STATUSES),
  memory_id: z.string().nullable(),
  tier_granted: tier.nullable(),
  deduped: z.boolean(),
  superseded: z.array(z.string()),
  reason_code: z.string().nullable(),
  human: z.string().nullable(),
  to_pass: toPass,
  /** `'R1.numeric-relaxation' | 'R6.llm-judge' | null`. */
  rule: z.string().nullable(),
  event_id: z.string(),
});

export const memoryRetrieveRequest = z.strictObject({
  query: z.string().min(1).max(2000),
  action_class: z.enum(ACTION_CLASSES),
  limit: z.number().int().min(1).max(200).default(12),
  /** Bi-temporal as-of: "what did we know on day N". */
  as_of: rfc3339.nullable(),
  /** Scope the candidate slice to one conversation before ranking. */
  conversation_id: z.string().min(1).max(200).nullish(),
  user_id: z.string(),
  tenant_id: z.string(),
});

export const memoryEntryView = z.strictObject({
  id: z.string(),
  type: z.string(),
  tier,
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
  /** `null` for action classes with `digest: false`. */
  digest: sha256Ref.nullable(),
  digest_alg: z.literal(MEMORY_DIGEST_ALG),
  tier_floor: tier,
});

export type MemoryWriteRequest = z.infer<typeof memoryWriteRequest>;
export type MemoryWriteResponse = z.infer<typeof memoryWriteResponse>;
export type MemoryRetrieveRequest = z.infer<typeof memoryRetrieveRequest>;
export type MemoryRetrieveResponse = z.infer<typeof memoryRetrieveResponse>;
