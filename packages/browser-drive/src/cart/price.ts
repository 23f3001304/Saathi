/**
 * Rupee text → integer paise, with no float path (mirrors `Money`, which this
 * package cannot construct because a scraped number is not a signed amount).
 * A currency marker is required: `10% off` and `2 left` are not prices, and a
 * scraper that thinks they are produces a cap check that means nothing.
 */

const CURRENCY_MARKER = /(₹|rs\.?|inr)/i;

/** ₹1,23,456.78 — Indian grouping, optional decimals, optional space. */
const AMOUNT = /(?:₹|rs\.?|inr)\s*([0-9][0-9,\s]*(?:\.[0-9]{1,2})?)/gi;

/** A bare number, used only where the caller already knows the cell is a price. */
const BARE_AMOUNT = /([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;

const PAISE_PER_RUPEE = 100;

export function hasCurrencyMarker(text: string): boolean {
  return CURRENCY_MARKER.test(text);
}

/** The first marked amount in the text, or null. */
export function parsePaise(text: string): number | null {
  const amounts = allPaise(text);
  return amounts[0] ?? null;
}

/** The largest marked amount — a total line often restates the subtotal too. */
export function parseLargestPaise(text: string): number | null {
  const amounts = allPaise(text);
  return amounts.length === 0 ? null : Math.max(...amounts);
}

export function allPaise(text: string): readonly number[] {
  const found: number[] = [];
  for (const match of text.matchAll(AMOUNT)) {
    const paise = toPaise(match[1] ?? "");
    if (paise !== null) {
      found.push(paise);
    }
  }
  return found;
}

/**
 * For a cell the markup already labelled as a price: the currency marker is
 * used when present and skipped when not.
 */
export function parseCellPaise(text: string): number | null {
  const marked = parsePaise(text);
  if (marked !== null) {
    return marked;
  }
  const bare = BARE_AMOUNT.exec(text);
  return bare === null ? null : toPaise(bare[1] ?? "");
}

const QTY = /(?:\bqty\b|\bquantity\b|\bx\b|×|मात्रा)\s*:?\s*([0-9]{1,3})\b/i;
const QTY_SUFFIX = /\b([0-9]{1,3})\s*(?:×|x)\s/i;

export function parseQty(text: string | null): number {
  if (text === null || text === "") {
    return 1;
  }
  const direct = QTY.exec(text) ?? QTY_SUFFIX.exec(text);
  if (direct === null) {
    return 1;
  }
  const parsed = Number.parseInt(direct[1] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function toPaise(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^[0-9]+(\.[0-9]{1,2})?$/.test(cleaned)) {
    return null;
  }
  const [major = "0", fraction = ""] = cleaned.split(".");
  const minor = fraction.padEnd(2, "0");
  const paise = Number(`${major}${minor}`);
  return Number.isSafeInteger(paise) ? paise : null;
}

export function toRupees(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const digits = Math.abs(paise).toString().padStart(3, "0");
  return `${sign}₹${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export { PAISE_PER_RUPEE };
