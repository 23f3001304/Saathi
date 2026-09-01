import type { JSX } from "react";
import { Chip } from "../primitives/Chip.tsx";
import { ProductImage } from "../primitives/ProductImage.tsx";
import { paise } from "../primitives/formatMoney.ts";
import { hostOf, splitCopy } from "./productUrl.ts";
import type {
  AuditedListingView,
  MerchantItemView,
} from "../api/merchantTypes.ts";
import { CUE_LABELS } from "../api/merchantTypes.ts";
import styles from "./ListingTable.module.css";

type ListingTableProps = {
  items: readonly MerchantItemView[];
  audited: readonly AuditedListingView[];
  onOpen: (itemId: string) => void;
};

function cuesFor(
  audited: readonly AuditedListingView[],
  itemId: string,
): readonly { kind: string }[] {
  return audited.find((row) => row.itemId === itemId)?.cues ?? [];
}

/**
 * The band, under the price it sits beneath. A listing with no floor says so
 * rather than showing a number: "no floor" and "a floor equal to the price"
 * are different declarations, and only one of them is a discount authority.
 *
 * A band declared against a price the merchant has since changed is called
 * out. The floor still binds — it is what they signed — but it no longer means
 * what the sentence beside it said when they signed it.
 */
function floorLine(item: MerchantItemView): string {
  if (item.floorPaise === null) return "no floor set";
  if (
    item.floorListPaise !== null &&
    item.floorListPaise !== item.amountPaise
  ) {
    return `floor ${paise(item.floorPaise)} · set against ${paise(item.floorListPaise)}`;
  }
  return `floor ${paise(item.floorPaise)}`;
}

function floorClass(item: MerchantItemView): string {
  const stale =
    item.floorPaise !== null &&
    item.floorListPaise !== null &&
    item.floorListPaise !== item.amountPaise;
  return stale ? `${styles.floor} ${styles.stale}` : styles.floor;
}

/** The catalogue as a table, because a shopkeeper reads down a column. */
export function ListingTable({
  items,
  audited,
  onOpen,
}: ListingTableProps): JSX.Element {
  if (items.length === 0) {
    return (
      <p className={styles.empty}>
        Nothing listed yet. A listing is a price and a link to the page where
        the thing actually is.
      </p>
    );
  }
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Listing</th>
          <th scope="col">Product page</th>
          <th scope="col" className={styles.right}>
            Price
          </th>
          <th scope="col">How it reads</th>
          <th scope="col">
            <span className={styles.srOnly}>Open</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const split = splitCopy(item.description);
          const cues = cuesFor(audited, item.itemId);
          return (
            <tr className={styles.row} key={item.itemId}>
              <td>
                <span className={styles.listing}>
                  <ProductImage
                    sku={item.itemId}
                    src={split.imageUrl}
                    className={styles.thumb}
                  />
                  <span>
                    <span className={styles.name}>{item.name}</span>
                    <span className={styles.itemId}>{item.itemId}</span>
                    {!item.active && <Chip variant="hatched">retired</Chip>}
                  </span>
                </span>
              </td>
              <td>
                {split.productUrl === null ? (
                  <span className={styles.missing}>no page linked</span>
                ) : (
                  <a
                    className={styles.link}
                    href={split.productUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {hostOf(split.productUrl)}
                  </a>
                )}
              </td>
              <td className={`${styles.right} tabular-nums`}>
                {paise(item.amountPaise)}
                <span className={floorClass(item)}>{floorLine(item)}</span>
              </td>
              <td>
                {cues.length === 0 ? (
                  <span className={styles.clean}>clean</span>
                ) : (
                  <span className={styles.cues}>
                    {cues.map((cue) => (
                      <Chip key={cue.kind} variant="crimson">
                        {CUE_LABELS[cue.kind] ?? cue.kind}
                      </Chip>
                    ))}
                  </span>
                )}
              </td>
              <td className={styles.right}>
                <button
                  type="button"
                  className={styles.open}
                  onClick={() => onOpen(item.itemId)}
                >
                  Open
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
