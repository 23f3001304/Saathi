import type { JSX } from "react";
import type { NegotiatedView, SettledSkuView } from "../api/merchantTypes.ts";
import { paise } from "../primitives/formatMoney.ts";
import styles from "./Negotiated.module.css";

type NegotiatedProps = { negotiated: NegotiatedView };

function totalOf(
  rows: readonly SettledSkuView[],
  field: "carts" | "clearedFloor" | "savedPaise",
): number {
  return rows.reduce((sum, row) => sum + row[field], 0);
}

/**
 * The headline sentence, counted rather than claimed. `cleared` is summed from
 * the same rows as `carts` instead of being assumed equal to it — if the
 * gateway had ever let a below-floor cart through, this would read "three of
 * four" and say so.
 */
function headline(rows: readonly SettledSkuView[]): string {
  const carts = totalOf(rows, "carts");
  const cleared = totalOf(rows, "clearedFloor");
  const noun = carts === 1 ? "cart" : "carts";
  const all = cleared === carts ? "all" : `${cleared} of ${carts}`;
  return `${carts} ${noun} settled below list this week; ${all} cleared your floor.`;
}

/**
 * What the floor won. Every other panel on this console explains a sale that
 * did not happen; this one counts sales that did, and only exist because a
 * band was standing when a buyer's ceiling was too low for the listed price.
 *
 * Nothing here is a projection or a forecast. Each row is a fold over
 * `negotiation.settled` events the gateway appended inside the same savepoint
 * that approved the cart, so a number here cannot exist without its verdict.
 */
export function Negotiated({ negotiated }: NegotiatedProps): JSX.Element {
  const rows = negotiated.settled;
  if (rows.length === 0) {
    return (
      <p className={styles.empty}>
        No cart has settled inside a band yet. This fills when a buyer&rsquo;s
        ceiling is below your listed price and your floor is not.
      </p>
    );
  }
  return (
    <div className={styles.panel}>
      <p className={styles.headline}>{headline(rows)}</p>
      <p className={styles.earned}>
        {paise(totalOf(rows, "savedPaise"))} of list price given up, on sales
        that would otherwise have failed the buyer&rsquo;s cap.
      </p>
      <ul className={styles.list}>
        {rows.map((row) => (
          <li className={styles.row} key={row.skuId}>
            <span className={styles.sku}>{row.skuId}</span>
            <span className={styles.band}>
              {paise(row.floorPaise)} – {paise(row.listPaise)}
            </span>
            <span className={styles.carts}>
              {row.carts} settled · {paise(row.savedPaise)} given up
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
