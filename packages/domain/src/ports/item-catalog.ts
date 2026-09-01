import type { Money } from "../money.js";

/**
 * One item the merchant owns at the payment provider.
 *
 * Razorpay's item entity models a price and a name, not a shelf: it carries no
 * category, no stock count and no returns policy. This port therefore carries
 * only what the provider actually holds, and every field the catalog needs
 * beyond it is filled in where the mapping happens, in the open.
 */
export interface MerchantItem {
  readonly itemId: string;
  readonly name: string;
  readonly description: string;
  readonly price: Money;
  readonly active: boolean;
}

export interface NewMerchantItem {
  readonly name: string;
  readonly description: string;
  readonly price: Money;
}

/** `null` means "leave as it is"; the provider patches only what it is sent. */
export interface MerchantItemPatch {
  readonly name: string | null;
  readonly description: string | null;
  readonly price: Money | null;
  readonly active: boolean | null;
}

/**
 * Reading the shelf. Split from the writing half so the merchant *agent* — the
 * party that negotiates over the inventory — can be given the ability to read
 * it without also being handed the ability to change what it is selling.
 */
export interface ItemCatalogReader {
  listItems(limit: number): Promise<readonly MerchantItem[]>;
}

/**
 * One shelf row as the gateway presents it: the provider's item, plus the
 * discount authority the merchant signed over it.
 *
 * The floor is deliberately *not* a field of `MerchantItem`. Razorpay holds no
 * such field, and putting it there would make a bound the gateway is holding
 * look like a fact the provider returned.
 */
export interface ShelfItem {
  readonly item: MerchantItem;
  /** `null` means no discount authority: the agent may only quote at list. */
  readonly floorPaise: number | null;
}

export interface ShelfReader {
  listShelf(limit: number): Promise<readonly ShelfItem[]>;
}

/**
 * The merchant's inventory at the provider. It writes, but it never moves
 * money: an item's amount is a *claim*, and nothing is charged until a
 * merchant-signed quote for it clears the gateway's checks.
 */
export interface ItemCatalog extends ItemCatalogReader {
  createItem(item: NewMerchantItem): Promise<MerchantItem>;
  updateItem(itemId: string, patch: MerchantItemPatch): Promise<MerchantItem>;
}
