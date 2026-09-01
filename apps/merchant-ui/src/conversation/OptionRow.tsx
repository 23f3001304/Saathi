import type { JSX } from "react";
import { Chip } from "../primitives/Chip.tsx";
import { Money } from "../primitives/Money.tsx";
import { ProductImage } from "../primitives/ProductImage.tsx";
import type { ChoiceOption } from "../assistant/turn.ts";
import styles from "./OptionRow.module.css";

type OptionRowProps = {
  option: ChoiceOption;
  selected: boolean;
  onPick: () => void;
};

/**
 * The shopper's option card, carrying a listing instead of a purchase. Same
 * rule as over there: no `recommended`, `sponsored`, `badge` or `highlighted`
 * prop exists, so nothing here can rank one of the shopkeeper's own listings
 * above another. Order is the shelf's order.
 */
export function OptionRow({
  option,
  selected,
  onPick,
}: OptionRowProps): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={selected ? `${styles.card} ${styles.selected}` : styles.card}
      onClick={onPick}
    >
      <ProductImage
        sku={option.id}
        src={option.imageUrl}
        className={styles.plate}
      />
      <span className={styles.top}>
        <span className={styles.itemId}>{option.id}</span>
      </span>
      <span className={styles.title}>{option.name}</span>
      <Money paise={option.amountPaise} className={styles.price} />
      <span className={styles.status}>
        {option.active ? (
          "on your shelf"
        ) : (
          <Chip variant="hatched">retired</Chip>
        )}
      </span>
    </button>
  );
}
