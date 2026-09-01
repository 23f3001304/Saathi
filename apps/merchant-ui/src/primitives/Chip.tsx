import type { JSX, ReactNode } from "react";
import styles from "./Chip.module.css";

type ChipVariant = "outline" | "filled" | "crimson" | "hatched";

type ChipProps = {
  children: ReactNode;
  variant?: ChipVariant;
  title?: string;
};

const VARIANT_CLASS: Record<ChipVariant, string | undefined> = {
  outline: undefined,
  filled: styles.filled,
  crimson: styles.crimson,
  hatched: styles.hatched,
};

/** Label-style chip — R3/R5: never a colour beyond ink/green/crimson. */
export function Chip({
  children,
  variant = "outline",
  title,
}: ChipProps): JSX.Element {
  const extra = VARIANT_CLASS[variant];
  const classes = extra ? `${styles.chip} ${extra}` : styles.chip;
  return (
    <span className={classes} title={title}>
      {children}
    </span>
  );
}
