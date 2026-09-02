import { z } from "zod";

import type { ShelfView } from "../merchant/turn-shelf.js";
import type { ToolArgs } from "../shared/tool-envelope.js";
import type { DraftFields } from "./turn-plan.js";

/** What a proposal is checked against: the operator's cap, the covenant's
 *  currency, and the shelf the turn opened. */
export interface DraftBounds {
  readonly capPaise: number;
  readonly currency: string;
  readonly shelf: ShelfView;
}

export type DraftParse =
  | { readonly ok: true; readonly draft: DraftFields }
  | { readonly ok: false; readonly failure: string };

/** The `propose_purchase` arguments beyond `reply`, as every provider is
 *  told about them. `description` is what the sheet prints. */
export const DRAFT_ARGS_SHAPE = {
  sku: z.string().min(1).max(120),
  max_amount_paise: z.number().int().positive(),
  requires_refundability: z.boolean(),
  description: z.string().min(1).max(400),
};

const ARGS = z.object(DRAFT_ARGS_SHAPE);

/**
 * DECISION: two checks and no rewriting. A ceiling above the operator's cap
 * used to be clamped by a regex over the shopper's sentence; now it comes
 * back to the model as `cap_exceeded` with the cap beside it, and the model
 * proposes again. A sku the shelf does not hold used to fall through to a
 * deterministic drafter picking the nearest row; now it is `sku_not_on_shelf`
 * and the model reads the shelf. `bounds === null` is the unit-test shape:
 * shapes are parsed, facts are not checked.
 */
export function draftOf(
  args: ToolArgs,
  bounds: DraftBounds | null,
): DraftParse {
  const parsed = ARGS.safeParse(args);
  if (!parsed.success) {
    return { ok: false, failure: "bad_arguments" };
  }
  const { sku, max_amount_paise, requires_refundability, description } =
    parsed.data;
  if (bounds !== null && max_amount_paise > bounds.capPaise) {
    return { ok: false, failure: "cap_exceeded" };
  }
  if (bounds !== null && !stocked(bounds, sku)) {
    return { ok: false, failure: "sku_not_on_shelf" };
  }
  return {
    ok: true,
    draft: {
      sku,
      maxAmountPaise: max_amount_paise,
      requiresRefundability: requires_refundability,
      description: description.trim(),
    },
  };
}

function stocked(bounds: DraftBounds, sku: string): boolean {
  return bounds.shelf.current().some((row) => row.sku === sku);
}
