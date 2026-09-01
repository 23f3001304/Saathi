import type {
  MerchantItem,
  MerchantItemPatch,
  NewMerchantItem,
  SkuPriceFloor,
} from "@covenant/domain";
import { Money } from "@covenant/domain";
import { z } from "zod";

/** Razorpay caps an item name at 512 characters; the description is prose. */
const NAME_MAX = 512;

const DESCRIPTION_MAX = 2048;

const money = z.strictObject({
  amount_paise: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export const newItemSchema = z
  .strictObject({
    name: z.string().min(1).max(NAME_MAX),
    description: z.string().max(DESCRIPTION_MAX),
  })
  .extend(money.shape);

export const itemPatchSchema = z.strictObject({
  name: z.string().min(1).max(NAME_MAX).nullable(),
  description: z.string().max(DESCRIPTION_MAX).nullable(),
  amount_paise: z.number().int().nonnegative().nullable(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable(),
  active: z.boolean().nullable(),
});

/**
 * `null` clears. One shape for set and clear, because they are one decision —
 * how much discount authority this listing carries — and a merchant should not
 * have to know which HTTP verb withdraws it.
 */
export const floorSchema = z.strictObject({
  floor_paise: z.number().int().positive().nullable(),
});

export type NewItemBody = z.infer<typeof newItemSchema>;

export type ItemPatchBody = z.infer<typeof itemPatchSchema>;

export function toNewItem(body: NewItemBody): NewMerchantItem {
  return {
    name: body.name,
    description: body.description,
    price: Money.fromPaise(body.amount_paise, body.currency),
  };
}

/** A price change needs both halves; one without the other is not a price. */
export function toItemPatch(body: ItemPatchBody): MerchantItemPatch {
  const { amount_paise: paise, currency } = body;
  return {
    name: body.name,
    description: body.description,
    price:
      paise === null || currency === null
        ? null
        : Money.fromPaise(paise, currency),
    active: body.active,
  };
}

/**
 * The wire shape of an item. `amount_paise` is named for what it is: a listed
 * **claim**, in integer paise, that becomes a price only once the merchant
 * signs a quote for it and `QuoteMatchCheck` finds the cart agreeing.
 */
export function itemWire(
  item: MerchantItem,
  floor: SkuPriceFloor | null = null,
): Record<string, unknown> {
  return {
    item_id: item.itemId,
    name: item.name,
    description: item.description,
    amount_paise: item.price.paise,
    currency: item.price.currency,
    active: item.active,
    price_provenance: "listed_claim_unsigned",
    ...floorWire(floor),
  };
}

/**
 * The declared band, or its absence. `null` is published as plainly as a
 * number: a buyer's agent must be able to tell "this merchant granted no
 * discount authority" from "this merchant granted some", and inferring the
 * second from silence is the one thing a floor may never be.
 */
export function floorWire(
  floor: SkuPriceFloor | null,
): Record<string, unknown> {
  return {
    floor_paise: floor?.floor_paise ?? null,
    floor_list_paise: floor?.list_paise ?? null,
    floor_declared_at: floor?.declared_at ?? null,
  };
}

export function floorBody(
  item: MerchantItem,
  floor: SkuPriceFloor | null,
): Record<string, unknown> {
  return { item: itemWire(item, floor) };
}
