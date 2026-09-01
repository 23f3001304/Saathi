/**
 * W3C PaymentRequest shapes, reused verbatim so that AP2 needs no cart schema
 * of its own (§A.2, §6.3). The only Covenant extension is the per-line
 * `sku` / `category` / `quantity` that envelope and SKU allowlist checks read.
 */
export interface PaymentCurrencyAmount {
  readonly currency: string;
  /** Decimal string in major units, e.g. `"1899.00"`. */
  readonly value: string;
}

export interface PaymentItem {
  readonly label: string;
  readonly amount: PaymentCurrencyAmount;
}

export interface CartLineItem extends PaymentItem {
  readonly sku: string;
  readonly category: string;
  readonly quantity: number;
}

export interface PaymentMethodData {
  readonly supportedMethods: string;
  readonly data: Readonly<Record<string, unknown>> | null;
}

export interface PaymentShippingOption {
  readonly id: string;
  readonly label: string;
  readonly amount: PaymentCurrencyAmount;
  readonly selected: boolean;
}

export interface PaymentDetailsModifier {
  readonly supportedMethods: string;
  readonly data: Readonly<Record<string, unknown>> | null;
}

export interface PaymentDetailsInit {
  readonly id: string;
  readonly total: PaymentItem;
  readonly displayItems: readonly CartLineItem[];
  readonly shippingOptions: readonly PaymentShippingOption[];
  readonly modifiers: readonly PaymentDetailsModifier[];
}

export interface PaymentOptions {
  readonly requestShipping: boolean;
}

export interface PaymentRequest {
  readonly methodData: readonly PaymentMethodData[];
  readonly details: PaymentDetailsInit;
  readonly options: PaymentOptions;
}

export interface PaymentResponse {
  readonly requestId: string;
  readonly methodName: string;
  readonly details: Readonly<Record<string, unknown>>;
}
