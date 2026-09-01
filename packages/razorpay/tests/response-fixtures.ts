/** Verbatim shape transcribed from the live docs fetch of `docs/api/orders/create`. */
export const ORDER_RESPONSE_FIXTURE = {
  amount: 5000,
  amount_due: 5000,
  amount_paid: 0,
  attempts: 0,
  created_at: 1756455561,
  currency: "INR",
  entity: "order",
  id: "order_RB58MiP5SPFYyM",
  notes: { key1: "value3", key2: "value2" },
  offer_id: null,
  receipt: "receipt#1",
  status: "created",
};

/** Verbatim shape transcribed from `docs/api/payments/payment-links/create-standard`. */
export const PAYMENT_LINK_RESPONSE_FIXTURE = {
  accept_partial: true,
  amount: 1000,
  amount_paid: 0,
  callback_method: "get",
  callback_url: "https://example-callback-url.com/",
  cancelled_at: 0,
  created_at: 1591097057,
  currency: "INR",
  customer: { contact: "<phone>", email: "<email>", name: "<name>" },
  description: "Payment for policy no #23456",
  expire_by: 1691097057,
  expired_at: 0,
  first_min_partial_amount: 100,
  id: "plink_ExjpAUN3gVHrPJ",
  notes: { policy_name: "Jeevan Bima" },
  notify: { email: true, sms: true },
  payments: null,
  reference_id: "TS1989",
  reminder_enable: true,
  reminders: [],
  short_url: "https://rzp.io/i/nxrHnLJ",
  status: "created",
  updated_at: 1591097057,
  user_id: "",
};

/** Verbatim shape transcribed from `docs/api/payments/fetch-with-id` (card payment, captured). */
export const PAYMENT_RESPONSE_FIXTURE = {
  id: "pay_DG4ZdRK8ZnXC3k",
  entity: "payment",
  amount: 100,
  currency: "INR",
  status: "captured",
  order_id: "order_GjCr5oKh4AVC51",
  invoice_id: null,
  international: false,
  method: "card",
  amount_refunded: 0,
  refund_status: null,
  captured: true,
  description: "Payment for Adidas shoes",
  card_id: "card_KOdY30ajbuyOYN",
  bank: null,
  wallet: null,
  vpa: null,
  email: "gaurav.kumar@example.com",
  contact: "9000090000",
  customer_id: "cust_K6fNE0WJZWGqtN",
  token_id: "token_KOdY$DBYQOv08n",
  notes: [],
  fee: 1,
  tax: 0,
  error_code: null,
  error_description: null,
  error_source: null,
  error_step: null,
  error_reason: null,
  acquirer_data: { auth_code: "064381", arn: "74119663031031075351326", rrn: "303107535132" },
  created_at: 1605871409,
};

/** Verbatim shape transcribed from `docs/api/payments/fetch-with-id` (error example). */
export const NOT_FOUND_ERROR_FIXTURE = {
  error: {
    code: "BAD_REQUEST_ERROR",
    description: "The id provided does not exist",
    source: "business",
    step: "payment_initiation",
    reason: "input_validation_failed",
    metadata: {},
  },
};

/** Verbatim shape transcribed from `docs/webhooks/payments` (payment.captured). */
export const PAYMENT_CAPTURED_WEBHOOK_FIXTURE = {
  entity: "event",
  account_id: "acc_BFQ7uQEaa7j2z7",
  event: "payment.captured",
  contains: ["payment"],
  payload: {
    payment: {
      entity: {
        id: "pay_DESlfW9H8K9uqM",
        entity: "payment",
        amount: 100,
        currency: "INR",
        status: "captured",
        order_id: "order_DESlLckIVRkHWj",
        error_code: null,
        error_description: null,
        created_at: 1567674599,
      },
    },
  },
  created_at: 1567674606,
};

/** Verbatim shape transcribed from `docs/webhooks/payments` (payment.failed). */
export const PAYMENT_FAILED_WEBHOOK_FIXTURE = {
  entity: "event",
  account_id: "acc_BFQ7uQEaa7j2z7",
  event: "payment.failed",
  contains: ["payment"],
  payload: {
    payment: {
      entity: {
        id: "pay_DEAU825sJlCbGa",
        entity: "payment",
        amount: 50000,
        currency: "INR",
        status: "failed",
        order_id: "order_DEATVTRRctwEGb",
        error_code: "BAD_REQUEST_ERROR",
        error_description: "Payment failed",
        created_at: 1567610214,
      },
    },
  },
  created_at: 1567610215,
};

/** Verbatim shape (fields load-bearing to this adapter) from `docs/webhooks/payment-links`. */
export const PAYMENT_LINK_PAID_WEBHOOK_FIXTURE = {
  account_id: "acc_OU2H3nkLn9jDVo",
  contains: ["payment_link", "order", "payment"],
  created_at: 1749618314,
  entity: "event",
  event: "payment_link.paid",
  payload: {
    order: { entity: { id: "order_QflczVVaNJciLq", status: "paid" } },
    payment: {
      entity: {
        id: "pay_Qfldmt5StKZFCB",
        amount: 1000,
        currency: "INR",
        status: "captured",
        order_id: "order_QflczVVaNJciLq",
        error_code: null,
      },
    },
    payment_link: {
      entity: {
        id: "plink_QflcnnZqCekuvL",
        amount: 1000,
        status: "paid",
        order_id: "order_QflczVVaNJciLq",
      },
    },
  },
};
