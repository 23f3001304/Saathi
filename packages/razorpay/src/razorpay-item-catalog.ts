import type {
  ItemCatalog,
  MerchantItem,
  MerchantItemPatch,
  NewMerchantItem,
} from "@covenant/domain";
import { DomainError } from "@covenant/domain";

import {
  isRazorpayItemList,
  isRazorpayItemResponse,
  toMerchantItem,
} from "./dto/item-dto.js";
import type { RazorpayItemResponse } from "./dto/item-dto.js";
import type { RazorpayClient } from "./razorpay-client.js";

/** `count` is capped at 100 by the API; asking for more is a 400, not a page. */
const MAX_COUNT = 100;

/**
 * Implements the domain's `ItemCatalog` port over Razorpay Items.
 *
 * Verified live against the test key: `POST /v1/items` (200, created
 * `item_TWNIHOyaam98x4`), `GET /v1/items?count=N` (200,
 * `{entity, count, items[]}`) and `PATCH /v1/items/{id}` (200, the item
 * entity). Route linked accounts are **not** enabled on this key —
 * `GET /v2/accounts` answers 404 — so nothing here reaches for Route, and
 * onboarding a sub-merchant is not something this adapter can pretend to do.
 *
 * Items is inventory, not money: this class can never create an order, a
 * payment link or a refund, and the one class that can (`RazorpayPaymentRail`)
 * is a sibling rather than a base, so no caller inherits both.
 */
export class RazorpayItemCatalog implements ItemCatalog {
  constructor(private readonly client: RazorpayClient) {}

  async listItems(limit: number): Promise<readonly MerchantItem[]> {
    const count = Math.max(1, Math.min(MAX_COUNT, Math.trunc(limit)));
    const response = await this.client.request<unknown>(
      "razorpay.items.list",
      "GET",
      `/items?count=${count}`,
      null,
    );
    if (!isRazorpayItemList(response)) {
      throw new DomainError("SCHEMA_VIOLATION");
    }
    return response.items.map((item) => toMerchantItem(item));
  }

  createItem(item: NewMerchantItem): Promise<MerchantItem> {
    return this.send("razorpay.items.create", "POST", "/items", {
      name: item.name,
      description: item.description,
      amount: item.price.paise,
      currency: item.price.currency,
    });
  }

  updateItem(itemId: string, patch: MerchantItemPatch): Promise<MerchantItem> {
    return this.send(
      "razorpay.items.update",
      "PATCH",
      `/items/${encodeURIComponent(itemId)}`,
      bodyOf(patch),
    );
  }

  private async send(
    span: string,
    method: "POST" | "PATCH",
    path: string,
    body: Record<string, unknown>,
  ): Promise<MerchantItem> {
    const response = await this.client.request<unknown>(
      span,
      method,
      path,
      body,
    );
    if (!isRazorpayItemResponse(response)) {
      throw new DomainError("SCHEMA_VIOLATION");
    }
    return toMerchantItem(response as RazorpayItemResponse);
  }
}

/** Only the fields the caller actually set: a PATCH of `null` would blank them. */
function bodyOf(patch: MerchantItemPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== null) {
    body["name"] = patch.name;
  }
  if (patch.description !== null) {
    body["description"] = patch.description;
  }
  if (patch.price !== null) {
    body["amount"] = patch.price.paise;
    body["currency"] = patch.price.currency;
  }
  if (patch.active !== null) {
    body["active"] = patch.active;
  }
  return body;
}
