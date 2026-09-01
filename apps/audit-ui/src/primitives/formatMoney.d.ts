/** D18 — Indian digit grouping: ₹1,23,456.00, never ₹123,456.00. */
export declare function paise(amountPaise: number): string;
/** For contexts (sparkline captions, chat prose) that want digits without the glyph. */
export declare function paiseDigitsOnly(amountPaise: number): string;
/**
 * Prose amounts ("₹1,299 for 30 of the last 34 days"), where two decimal
 * places are noise. Still Intl/en-IN, so the grouping stays Indian —
 * callers used to hand-roll this as `(paise / 100).toFixed(0)`, which
 * silently produced ₹1299 and broke D18.
 */
export declare function rupeesRounded(amountPaise: number): string;
export declare function percent(fraction: number, digits?: number): string;
//# sourceMappingURL=formatMoney.d.ts.map