import type { JSX } from "react";
import { ProductImage } from "../primitives/ProductImage.tsx";
import { safeImageUrl } from "./productUrl.ts";
import styles from "./ListingEditor.module.css";

type ImageFieldProps = {
  value: string;
  /** What the fallback weave is keyed to: the item id, or the name until there is one. */
  sku: string;
  onChange: (value: string) => void;
};

/**
 * The preview is the same component the buyer's card renders, so a shopkeeper
 * watches their own link fail here rather than finding out from a buyer.
 */
export function ImageField({
  value,
  sku,
  onChange,
}: ImageFieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <label className={styles.field}>
        <span className={styles.label}>Product image</span>
        <input
          className={styles.input}
          value={value}
          inputMode="url"
          placeholder="https://your-shop.example/the-thing.jpg"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <span className={styles.note}>
        A link to a picture on your own site. We do not host it, and a buyer
        loads it from you. Leave it blank, or let the link rot, and buyers see
        the woven mark below instead.
      </span>
      <ProductImage
        sku={sku}
        src={safeImageUrl(value)}
        className={styles.preview}
      />
    </div>
  );
}
