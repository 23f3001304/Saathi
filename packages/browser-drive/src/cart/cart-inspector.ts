import type {
  CartConfidence,
  CartDom,
  CartItem,
  CartReading,
  CartRowDom,
} from "./cart-dom.js";
import { UNREADABLE_CART } from "./cart-dom.js";
import {
  parseCellPaise,
  parseLargestPaise,
  parsePaise,
  parseQty,
} from "./price.js";

const STRONG_TOTAL =
  /\b(grand\s+total|order\s+total|total\s+payable|amount\s+payable|net\s+payable|to\s+pay)\b|कुल\s*देय|देय\s*राशि/i;
const WEAK_TOTAL = /\b(total|subtotal|amount)\b|कुल|योग/i;

const PRICE_NOISE = /(?:₹|rs\.?|inr)\s*[0-9][0-9,\s]*(?:\.[0-9]{1,2})?/gi;
const QTY_NOISE = /\b(qty|quantity|मात्रा)\b\s*:?\s*[0-9]{1,3}\b/gi;
const MAX_LABEL = 80;

interface TotalPick {
  readonly paise: number;
  readonly basis: string;
  readonly strong: boolean;
}

/**
 * Heuristic, and it says so. This is a *foreign* cart — markup nobody agreed
 * on — so the honest output is a number plus how much to trust it, never a
 * number alone. `CartCovenant` is the caller that refuses on weak readings;
 * this class only reports.
 */
export class CartInspector {
  constructor(private readonly currency: string = "INR") {}

  inspect(dom: CartDom): CartReading {
    const items = this.itemsOf(dom.rows);
    const picked = pickTotal(dom.totalCandidates);
    if (picked !== null) {
      return this.fromTotal(picked, items);
    }
    return items.length === 0 ? UNREADABLE_CART : this.fromItems(items);
  }

  private itemsOf(rows: readonly CartRowDom[]): readonly CartItem[] {
    return rows.map((row) => toItem(row)).filter((item) => item !== null);
  }

  private fromTotal(
    picked: TotalPick,
    items: readonly CartItem[],
  ): CartReading {
    return {
      totalPaise: picked.paise,
      currency: this.currency,
      items,
      confidence: confidenceOf(picked, items),
      basis: picked.basis,
    };
  }

  /** No labelled total: the sum of the rows is a guess, and is graded as one. */
  private fromItems(items: readonly CartItem[]): CartReading {
    const sum = sumOf(items);
    if (sum === null) {
      return { ...UNREADABLE_CART, items, basis: "rows_without_prices" };
    }
    return {
      totalPaise: sum,
      currency: this.currency,
      items,
      confidence: "low",
      basis: "summed_item_rows",
    };
  }
}

function toItem(row: CartRowDom): CartItem | null {
  const linePaise =
    (row.priceText === null ? null : parseCellPaise(row.priceText)) ??
    parsePaise(row.text);
  if (linePaise === null) {
    return null;
  }
  const qty = parseQty(row.qtyText ?? row.text);
  return {
    label: labelOf(row.text),
    qty,
    unitPaise: linePaise % qty === 0 ? linePaise / qty : null,
    linePaise,
  };
}

function labelOf(text: string): string {
  return text
    .replace(PRICE_NOISE, " ")
    .replace(QTY_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL);
}

function pickTotal(candidates: readonly string[]): TotalPick | null {
  let best: TotalPick | null = null;
  for (const candidate of candidates) {
    const paise = parseLargestPaise(candidate);
    if (paise === null) {
      continue;
    }
    const strong = STRONG_TOTAL.test(candidate);
    if (!strong && !WEAK_TOTAL.test(candidate)) {
      continue;
    }
    const pick: TotalPick = {
      paise,
      basis: strong ? "labelled_grand_total" : "labelled_total",
      strong,
    };
    best = better(best, pick);
  }
  return best;
}

function better(current: TotalPick | null, pick: TotalPick): TotalPick {
  if (current === null) {
    return pick;
  }
  return !current.strong && pick.strong ? pick : current;
}

/**
 * `high` needs corroboration: a labelled grand total that is at least the sum
 * of the rows we could read. A total *below* the rows means we misread one of
 * them, which is exactly when the cap check must not be trusted.
 */
function confidenceOf(
  picked: TotalPick,
  items: readonly CartItem[],
): CartConfidence {
  const sum = sumOf(items);
  if (sum === null) {
    return picked.strong ? "medium" : "low";
  }
  if (sum > picked.paise) {
    return "low";
  }
  return picked.strong ? "high" : "medium";
}

function sumOf(items: readonly CartItem[]): number | null {
  const lines = items
    .map((item) => item.linePaise)
    .filter((paise) => paise !== null);
  return lines.length === 0 ? null : lines.reduce((a, b) => a + b, 0);
}
