import { useRef, useState, type JSX } from "react";
import type { OptionRowData } from "./chatScript.ts";
import { evidenceLine, OptionRow } from "./OptionRow.tsx";
import { rupeesRounded } from "../primitives/formatMoney.ts";
import { useReveal } from "../motion/useReveal.ts";
import styles from "./OptionSet.module.css";

export type OptionSetProps = {
  options: OptionRowData[];
  /**
   * The option that ended up in the cart. Not a rank and not a promotion:
   * it names a decision the buyer has already taken, and its only effect is
   * to open that card's evidence first. Every option stays on screen.
   */
  inCartId?: string;
  /** A pick made outside the grid. the dock's choice chips. Wins when set. */
  selectedId?: string;
  onAsk: (optionId: string) => void;
};

/** The anchoring defence, in words: a strikethrough MRP the history contradicts. */
function honestyLine(option: OptionRowData): string | undefined {
  const { daysAtPrice, ofDays, mrpClaimPaise, pricePaise } = option;
  if (daysAtPrice === undefined || ofDays === undefined) return undefined;
  const held = `${rupeesRounded(pricePaise)} for ${daysAtPrice} of the last ${ofDays} days`;
  if (mrpClaimPaise === undefined) return held;
  return `Shown as ${rupeesRounded(mrpClaimPaise)} off, but it has sold at ${held}.`;
}

/** Catalog fields the merchant did not supply arrive as 0; say nothing rather than "0". */
function facts(option: OptionRowData): string | undefined {
  const parts: string[] = [];
  if (option.rating > 0) parts.push(`${option.rating.toFixed(1)} rating`);
  if (option.deliveryDays > 0)
    parts.push(`${option.deliveryDays}-day delivery`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function Evidence({ option }: { option: OptionRowData }): JSX.Element {
  const honesty = honestyLine(option);
  const extra = facts(option);
  return (
    <div className={styles.evidence}>
      <p className={styles.why}>
        {option.whyThis ?? `${option.title} from ${option.merchant}.`}
      </p>
      {honesty !== undefined && <p className={styles.honesty}>{honesty}</p>}
      <p className={styles.meta}>
        {option.honourRate !== undefined && (
          <span>Honours quotes {Math.round(option.honourRate * 100)}%</span>
        )}
        {extra !== undefined && <span>{extra}</span>}
      </p>
    </div>
  );
}

/**
 * §2.1/§4.5. "Invariant enforced in the component, not by convention: no
 * `recommended`, `sponsored`, `badge`, or `highlighted` prop exists." That's
 * literal: no field here ranks, promotes or decorates a card. Card order is
 * the only encoding of rank, and `SortKeyBanner` (rendered by the caller,
 * always above this) says why that order is what it is.
 *
 * All options stay visible. Choosing one opens its evidence underneath -
 * the price history, the merchant's quote-honour rate, and why it matches
 * the buyer's own stated preference.
 */
/** Up to this many options render as picture cards; past it the set turns
 *  into a dense list, one row per option, everything visible at once. Eight
 *  tiles was a horizontal scroller with its third card cut mid-price, and
 *  eight anything is a comparison, which is a table's job, not a gallery's. */
const TILES_UP_TO = 4;

/** One option as a row: swatch of rank order, name, price, provenance. The
 *  whole row is the handle. Same invariant as the tiles: nothing here ranks,
 *  promotes or decorates one option over another. */
function OptionLine({
  option,
  selected,
  onAsk,
}: {
  option: OptionRowData;
  selected: boolean;
  onAsk: () => void;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        className={selected ? `${styles.line} ${styles.lineOn}` : styles.line}
        onClick={onAsk}
        aria-pressed={selected}
      >
        <span className={styles.lineTitle}>{option.title}</span>
        <span className={styles.lineMerchant}>{option.merchant}</span>
        <span className={styles.lineQuote}>{evidenceLine(option)}</span>
        <span className={styles.linePrice}>
          {rupeesRounded(option.pricePaise)}
        </span>
      </button>
    </li>
  );
}

export function OptionSet({
  options,
  inCartId,
  selectedId,
  onAsk,
}: OptionSetProps): JSX.Element {
  const gridRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = selectedId ?? openId ?? inCartId ?? null;
  const open = options.find((o) => o.id === shown);
  const dense = options.length > TILES_UP_TO;
  useReveal(gridRef, options.map((o) => o.id).join());

  return (
    <div className={styles.set}>
      {dense ? (
        <ul className={styles.lines} role="group" aria-label="Options">
          {options.map((option) => (
            <OptionLine
              key={option.id}
              option={option}
              selected={option.id === shown}
              onAsk={() => {
                setOpenId(option.id);
                onAsk(option.id);
              }}
            />
          ))}
        </ul>
      ) : (
        <div
          className={styles.grid}
          ref={gridRef}
          role="group"
          aria-label="Options"
        >
          {options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              selected={option.id === shown}
              onAsk={() => {
                setOpenId(option.id);
                onAsk(option.id);
              }}
            />
          ))}
        </div>
      )}
      {open !== undefined && <Evidence option={open} />}
    </div>
  );
}
