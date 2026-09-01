import type {
  CartLineItem,
  PaymentCurrencyAmount,
  PaymentDetailsInit,
  PaymentDetailsModifier,
  PaymentItem,
  PaymentMethodData,
  PaymentRequest,
  PaymentShippingOption,
} from "@covenant/domain";

import { array, bool, int, record, str } from "./subject-fields.js";

/**
 * W3C `PaymentRequest`, reused verbatim so AP2 needs no cart schema of its own
 * (§A.2). Reading it back structurally matters because `cart_hash` is
 * `sha256(canonicalize(payment_request))`: a field this reader silently dropped
 * would be a field the hash no longer covers.
 */
export function readPaymentRequest(value: unknown): PaymentRequest {
  const raw = record(value);
  return {
    methodData: array(raw["methodData"]).map((entry) => readMethodData(entry)),
    details: readDetails(record(raw["details"])),
    options: readOptions(record(raw["options"])),
  };
}

function readMethodData(value: unknown): PaymentMethodData {
  const raw = record(value);
  return {
    supportedMethods: str(raw["supportedMethods"]),
    data: raw["data"] === null ? null : record(raw["data"]),
  };
}

function readDetails(raw: Record<string, unknown>): PaymentDetailsInit {
  return {
    id: str(raw["id"]),
    total: readItem(record(raw["total"])),
    displayItems: array(raw["displayItems"]).map((entry) => readLine(entry)),
    shippingOptions: array(raw["shippingOptions"]).map((entry) =>
      readShippingOption(entry),
    ),
    modifiers: array(raw["modifiers"]).map((entry) => readModifier(entry)),
  };
}

function readItem(raw: Record<string, unknown>): PaymentItem {
  return { label: str(raw["label"]), amount: readAmount(raw["amount"]) };
}

function readLine(value: unknown): CartLineItem {
  const raw = record(value);
  return {
    ...readItem(raw),
    sku: str(raw["sku"]),
    category: str(raw["category"]),
    quantity: int(raw["quantity"]),
  };
}

function readAmount(value: unknown): PaymentCurrencyAmount {
  const raw = record(value);
  return { currency: str(raw["currency"]), value: str(raw["value"]) };
}

function readShippingOption(value: unknown): PaymentShippingOption {
  const raw = record(value);
  return {
    id: str(raw["id"]),
    label: str(raw["label"]),
    amount: readAmount(raw["amount"]),
    selected: bool(raw["selected"]),
  };
}

function readModifier(value: unknown): PaymentDetailsModifier {
  const raw = record(value);
  return {
    supportedMethods: str(raw["supportedMethods"]),
    data: raw["data"] === null ? null : record(raw["data"]),
  };
}

function readOptions(raw: Record<string, unknown>): {
  readonly requestShipping: boolean;
} {
  return { requestShipping: bool(raw["requestShipping"]) };
}
