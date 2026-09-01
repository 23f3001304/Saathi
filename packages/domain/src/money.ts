/** ISO-4217 alpha-3 code, e.g. `INR`. */
export type CurrencyCode = string;

const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MAJOR_UNITS_PATTERN = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;
const MINOR_UNITS_PER_MAJOR = 2;

/**
 * Money as integer minor units (paise) — ACP's `max_amount` shape (§A.1).
 * There is no float path in or out: construction rejects non-integers and
 * formatting is string surgery, so ₹0.1 + ₹0.2 can never drift.
 */
export class Money {
  private constructor(
    readonly paise: number,
    readonly currency: CurrencyCode,
  ) {}

  static fromPaise(paise: number, currency: CurrencyCode): Money {
    if (!Number.isSafeInteger(paise)) {
      throw new RangeError(
        `Money requires integer paise within the safe range, got ${paise}`,
      );
    }
    if (!CURRENCY_PATTERN.test(currency)) {
      throw new RangeError(
        `Money requires an ISO-4217 alpha-3 currency, got "${currency}"`,
      );
    }
    return new Money(paise, currency);
  }

  /**
   * Parses a W3C `PaymentCurrencyAmount.value` decimal string (§6.3) without
   * ever producing a float: the fraction is padded, not multiplied.
   */
  static fromMajorUnits(value: string, currency: CurrencyCode): Money {
    const parsed = MAJOR_UNITS_PATTERN.exec(value);
    if (parsed === null) {
      throw new RangeError(
        `Money requires a decimal string with at most 2 places, got "${value}"`,
      );
    }
    const [, sign = "", major = "0", fraction = ""] = parsed;
    const minor = fraction.padEnd(MINOR_UNITS_PER_MAJOR, "0");
    return Money.fromPaise(Number(`${sign}${major}${minor}`), currency);
  }

  static zero(currency: CurrencyCode): Money {
    return Money.fromPaise(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.fromPaise(this.paise + other.paise, this.currency);
  }

  /** -1 when this is smaller, 0 when equal, 1 when larger. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    if (this.paise < other.paise) {
      return -1;
    }
    return this.paise > other.paise ? 1 : 0;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.paise === other.paise;
  }

  isAtMost(other: Money): boolean {
    return this.compare(other) <= 0;
  }

  toString(): string {
    const sign = this.paise < 0 ? "-" : "";
    const digits = Math.abs(this.paise)
      .toString()
      .padStart(MINOR_UNITS_PER_MAJOR + 1, "0");
    const major = digits.slice(0, -MINOR_UNITS_PER_MAJOR);
    const minor = digits.slice(-MINOR_UNITS_PER_MAJOR);
    return `${this.currency} ${sign}${major}.${minor}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new TypeError(
        `Currency mismatch: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
