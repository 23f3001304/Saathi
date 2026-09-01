import type { MerchantItem } from "@covenant/domain";
import { DomainError, Money } from "@covenant/domain";

/**
 * The item entity, verified against `docs/api/payments/items` and against a
 * live test-key `GET /v1/items`, which answered
 * `{id, active, name, description, amount, unit_amount, currency, type, unit,
 * tax_inclusive, hsn_code, sac_code, tax_rate, tax_id, tax_group_id,
 * created_at}`. Only the fields the catalog reads are modelled; the rest pass
 * through Razorpay untouched.
 */
export interface RazorpayItemResponse {
  readonly id: string;
  readonly active: boolean;
  readonly name: string;
  readonly description: string | null;
  readonly amount: number;
  readonly currency: string;
}

export interface RazorpayItemList {
  readonly count: number;
  readonly items: readonly RazorpayItemResponse[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isRazorpayItemResponse(
  value: unknown,
): value is RazorpayItemResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value["id"] === "string" &&
    typeof value["active"] === "boolean" &&
    typeof value["name"] === "string" &&
    typeof value["amount"] === "number" &&
    typeof value["currency"] === "string" &&
    (value["description"] === null || typeof value["description"] === "string")
  );
}

export function isRazorpayItemList(value: unknown): value is RazorpayItemList {
  if (!isRecord(value) || !Array.isArray(value["items"])) {
    return false;
  }
  return value["items"].every((entry) => isRazorpayItemResponse(entry));
}

/**
 * A `description` Razorpay never received comes back `null`, and the catalog
 * carries prose rather than absence — so the empty string is the honest read
 * of "the merchant wrote nothing", not a value invented to fill a hole.
 */
export function toMerchantItem(item: RazorpayItemResponse): MerchantItem {
  try {
    return {
      itemId: item.id,
      name: item.name,
      description: item.description ?? "",
      price: Money.fromPaise(item.amount, item.currency),
      active: item.active,
    };
  } catch {
    throw new DomainError("SCHEMA_VIOLATION");
  }
}
