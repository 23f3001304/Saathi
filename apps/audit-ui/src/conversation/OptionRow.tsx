import type { JSX } from "react";
import type { OptionRowData } from "./chatScript.ts";
import { Money } from "../primitives/Money.tsx";
import { Glyph } from "../primitives/Glyph.tsx";
import { ProductImage } from "../primitives/ProductImage.tsx";
import styles from "./OptionRow.module.css";

type OptionRowProps = {
  option: OptionRowData;
  selected: boolean;
  onAsk: () => void;
};

/** No `recommended`/`sponsored`/`badge`/`highlighted` prop exists — see OptionSet.tsx. */

/**
 * The evidence tier, stated at the point of decision: a price backed by a
 * merchant-signed quote is a different object from a price scraped off a
 * listing, and this is the one line on the card no other agentic shopping
 * surface can print. Text stays ink; only the mark carries colour, and the
 * two states differ in shape as well as hue.
 *
 * A row the agent found on the open web says so in the same breath rather than
 * on a line of its own: `quoteSigned` is still the tier — false, because nobody
 * signed a price on that shop — and `sourceUrl` says where the unsigned number
 * came from. "Page price, unsigned" is a stronger claim than "no signed quote",
 * and it is the true one for a number read off a live listing.
 */
function evidenceLine(option: OptionRowData): string {
  if (option.quoteSigned === true) return "signed quote";
  return option.sourceUrl === undefined
    ? "no signed quote"
    : "page price, unsigned";
}

function Evidence({ option }: { option: OptionRowData }): JSX.Element {
  const ok = option.quoteSigned === true;
  return (
    <span
      className={
        ok ? styles.evidence : `${styles.evidence} ${styles.evidenceWeak}`
      }
    >
      <span className={ok ? styles.evidenceMark : undefined} aria-hidden="true">
        <Glyph name={ok ? "check" : "range"} size={11} />
      </span>
      {evidenceLine(option)}
    </span>
  );
}

export function OptionRow({
  option,
  selected,
  onAsk,
}: OptionRowProps): JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={selected ? `${styles.card} ${styles.selected}` : styles.card}
      onClick={onAsk}
    >
      {/* The reference letter stays first in the DOM: it is how the buyer
          names an option back to the agent ("tell me about B"). */}
      <span className={styles.id}>{option.id}</span>
      {/* The merchant's own picture where they gave one; a woven mark keyed to
          the SKU where they did not, or where their link is dead. */}
      <ProductImage
        sku={option.sku}
        src={option.imageUrl ?? null}
        className={styles.plate}
      />
      <span className={styles.top}>
        <span className={styles.merchant}>{option.merchant}</span>
      </span>
      <span className={styles.title}>{option.title}</span>
      <Money paise={option.pricePaise} className={styles.price} />
      <Evidence option={option} />
    </button>
  );
}
