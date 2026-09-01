// R7 / §6.4 — the only place money is formatted. Input is always integer
// paise; there is no float arithmetic on money anywhere in the UI.
const FORMATTER = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** D18 — Indian digit grouping: ₹1,23,456.00, never ₹123,456.00. */
export function paise(amountPaise: number): string {
  return FORMATTER.format(amountPaise / 100);
}

/** For contexts (sparkline captions, chat prose) that want digits without the glyph. */
export function paiseDigitsOnly(amountPaise: number): string {
  return paise(amountPaise).replace(/^₹/, "");
}

const ROUNDED = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Prose amounts ("₹1,299 for 30 of the last 34 days"), where two decimal
 * places are noise. Still Intl/en-IN, so the grouping stays Indian —
 * callers used to hand-roll this as `(paise / 100).toFixed(0)`, which
 * silently produced ₹1299 and broke D18.
 */
export function rupeesRounded(amountPaise: number): string {
  return ROUNDED.format(amountPaise / 100);
}

export function percent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}
