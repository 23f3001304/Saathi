// The merchant agent's tool contract.
//
// This is the whole surface, and it is deliberately small. Read it as two
// lists that must never merge:
//
//   kind: "read"    — answers a question from a fold or from Razorpay. The
//                     agent chooses which fold and how to say it. It is never
//                     the source of a figure inside the answer.
//   kind: "propose" — drafts an act. It writes nothing. The proposal goes on
//                     screen with its numbers, and the merchant signs it with
//                     their own key or it does not happen.
//
// There is no third kind, and in particular there is no tool that moves money,
// issues a mandate, touches a cart, or acts on a buyer's cool-off. A shop may
// look at a cool-off window; cancelling or releasing one belongs to the buyer
// who is inside it, and giving a seller that button would invert the whole
// protection.
//
// `source` is not documentation. It is the rule that every figure comes from
// the ledger or from Razorpay, written where a reviewer can check it against
// the code that answers.

export type MerchantToolKind = "read" | "propose";

export type MerchantTool = {
  readonly name: string;
  readonly kind: MerchantToolKind;
  /** What the shopkeeper gets, in their words. */
  readonly summary: string;
  /** Exactly where every number in the answer is read from, for review. */
  readonly source: string;
  /** The same fact in a shopkeeper's words. This is what the screen shows. */
  readonly reads: string;
  readonly args: readonly string[];
};

export const MERCHANT_TOOLS: readonly MerchantTool[] = [
  {
    name: "shop.briefing",
    kind: "read",
    summary: "Rank what is costing this shop sales, worst first.",
    source:
      "merchant_trust fold, listing audit, catalog.read and verdict.emitted events",
    reads: "read your ledger",
    args: [],
  },
  {
    name: "shop.standing",
    kind: "read",
    summary: "The trust fold, its weighted terms and what each is out of.",
    source: "merchant_trust fold via GET /v1/merchant/standing",
    reads: "read how buyers rated you",
    args: [],
  },
  {
    name: "listings.audit",
    kind: "read",
    summary: "Which listings carry copy a buyer agent reads as a dark pattern.",
    source:
      "detectAcross over live Razorpay item copy via GET /v1/merchant/listings/audit",
    reads: "read your listing copy",
    args: ["item_id?"],
  },
  {
    name: "demand.unmet",
    kind: "read",
    summary:
      "Searches buyer agents ran here that matched nothing on the shelf.",
    source: "catalog.read events with result_count = 0",
    reads: "read searches that found nothing",
    args: [],
  },
  {
    name: "orders.recent",
    kind: "read",
    summary: "Payment records and their covenant state. No fulfilment exists.",
    source: "transactions table via GET /v1/transactions",
    reads: "read your orders",
    args: ["state?"],
  },
  {
    name: "orders.cooloff",
    kind: "read",
    summary: "Purchases still inside a cool-off, and when each one releases.",
    source: "transactions.cooloff_until, state = pending_cooloff",
    reads: "read what is still on hold",
    args: [],
  },
  {
    name: "leakage.refusals",
    kind: "read",
    summary: "Every reason code a verdict named while deciding a cart here.",
    source: "verdict.emitted events via GET /v1/merchant/leakage",
    reads: "read the sales that were turned down",
    args: [],
  },
  {
    name: "listing.propose_create",
    kind: "propose",
    summary: "Draft a new listing. The merchant signs it or it does not exist.",
    source:
      "the merchant's own words; the price is echoed back, never invented",
    reads: "drafted a listing from your words",
    args: ["name", "amount_paise", "description?", "product_url?"],
  },
  {
    name: "listing.propose_edit",
    kind: "propose",
    summary: "Draft a change to one listing, audit included, for signing.",
    source: "the live Razorpay item plus the merchant's own words",
    reads: "drafted a change to a listing",
    args: [
      "item_id",
      "name?",
      "amount_paise?",
      "description?",
      "product_url?",
      "active?",
    ],
  },
];

export function toolNamed(name: string): MerchantTool | null {
  return MERCHANT_TOOLS.find((tool) => tool.name === name) ?? null;
}
