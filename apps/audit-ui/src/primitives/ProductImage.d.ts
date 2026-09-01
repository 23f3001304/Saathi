import { type JSX } from "react";
export type ProductImageProps = {
    sku: string;
    /** The merchant's claim about what the thing looks like, or nothing. */
    src: string | null;
    className?: string;
};
/**
 * The merchant's photograph where there is one, the woven plate where there is
 * not — and the plate again the moment the photograph fails to load, so a dead
 * or hostile link degrades to a mark rather than to a broken-image icon.
 *
 * `alt` is empty on purpose. The card names the product in text beside this,
 * and an alt fed from merchant copy would be merchant prose read aloud to a
 * screen reader as though the system had described the picture.
 *
 * `referrerPolicy` and `loading` are the privacy floor: the merchant's host
 * learns a shopper's IP and user agent when it serves the bytes, and these
 * keep it from also learning which page asked, or from being pinged at all
 * for a card the shopper never scrolled to.
 */
export declare function ProductImage({ sku, src, className, }: ProductImageProps): JSX.Element;
//# sourceMappingURL=ProductImage.d.ts.map