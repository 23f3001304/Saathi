import { z } from "zod";

import { AMENDABLE_RULES } from "./covenant-amendment.js";

/** One durable fact about the shopper, as the model heard it. */
export interface TraitClaim {
  readonly key: string;
  readonly value: string;
}

export const TRAIT_ARGS_SHAPE = {
  key: z.string().min(1).max(40),
  value: z.string().min(1).max(200),
};

const ARGS = z.object(TRAIT_ARGS_SHAPE);

/**
 * The key is normalised here rather than wherever it is stored, because the
 * store supersedes on it: `Shoe Size` and `shoe_size` are one fact about one
 * person, and two spellings would leave the old value live beside the new.
 */
function keyOf(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * DECISION: a trait may not be filed under the name of a bound. A trait is
 * something the shopper said about themselves, and the write gate grants it P1
 * — which is exactly the tier that cannot widen a constraint. Refusing the name
 * outright means the question of whether `max_amount: 900000` remembered as a
 * "preference" could ever be read as a ceiling never arises: no such row can be
 * written from here at all. Only a signature moves a rule.
 */
export function parseTrait(args: unknown): TraitClaim | null {
  const parsed = ARGS.safeParse(args);
  if (!parsed.success) {
    return null;
  }
  const key = keyOf(parsed.data.key);
  const value = parsed.data.value.trim();
  if (key.length === 0 || value.length === 0) {
    return null;
  }
  return AMENDABLE_RULES[key] === undefined ? { key, value } : null;
}
