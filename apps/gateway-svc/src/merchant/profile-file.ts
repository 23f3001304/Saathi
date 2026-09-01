import { readFileSync } from "node:fs";

import { Money } from "@covenant/domain";
import { z } from "zod";

import type { MerchantProfile } from "./onboarding.js";

const profileSchema = z.strictObject({
  slug: z.string().min(1),
  display_name: z.string().min(1),
  items: z.array(
    z.strictObject({
      name: z.string().min(1).max(512),
      description: z.string().max(2048),
      amount_paise: z.number().int().nonnegative(),
      currency: z.string().regex(/^[A-Z]{3}$/),
    }),
  ),
});

/**
 * An onboarding profile is operator input, so it is parsed strictly: an unknown
 * key is a rejection rather than a silently ignored line, and a price is
 * integer paise or it is not a price. The file names real items that will exist
 * in a real Razorpay account a second later; a typo caught here costs nothing.
 */
export function readProfile(path: string): MerchantProfile {
  const parsed = profileSchema.safeParse(
    JSON.parse(readFileSync(path, "utf8")) as unknown,
  );
  if (!parsed.success) {
    throw new Error(
      `merchant profile ${path} is invalid:\n${parsed.error.issues
        .map(
          (issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`,
        )
        .join("\n")}`,
    );
  }
  return {
    slug: parsed.data.slug,
    displayName: parsed.data.display_name,
    items: parsed.data.items.map((item) => ({
      name: item.name,
      description: item.description,
      price: Money.fromPaise(item.amount_paise, item.currency),
    })),
  };
}
