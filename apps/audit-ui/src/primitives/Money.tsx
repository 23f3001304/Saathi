import type { JSX } from "react";
import { paise } from "./formatMoney.ts";
import styles from "./Money.module.css";

type MoneyProps = {
  paise: number;
  className?: string;
};

/** §6.4 — every rendered money amount goes through this component. */
export function Money({ paise: amount, className }: MoneyProps): JSX.Element {
  const formatted = paise(amount);
  const symbol = formatted.slice(0, 1);
  const digits = formatted.slice(1);
  const classes = className ? `${styles.money} ${className}` : styles.money;
  // The symbol is split for column alignment, not to be hidden: it used to
  // carry aria-hidden, so every amount in the app was announced without its
  // currency. The whole value is exposed once, and the parts are decorative.
  return (
    <span className={classes} role="text" aria-label={formatted}>
      <span className={styles.symbol} aria-hidden="true">
        {symbol}
      </span>
      <span className={styles.digits} aria-hidden="true">
        {digits}
      </span>
    </span>
  );
}
