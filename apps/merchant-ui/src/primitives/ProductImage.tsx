import { useState, type JSX } from "react";
import { ProductPlate } from "./ProductPlate.tsx";

export type ProductImageProps = {
  sku: string;
  /** The merchant's claim about what the thing looks like, or nothing. */
  src: string | null;
  className?: string;
};

/**
 * `https:` only, re-checked here rather than trusted from the write path.
 * This is the last place the value can be refused before it reaches another
 * person's browser, and a render site that trusts its caller is a render site
 * that ships whatever the caller was given.
 */
function remoteImage(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

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
export function ProductImage({
  sku,
  src,
  className,
}: ProductImageProps): JSX.Element {
  const [failed, setFailed] = useState<string | null>(null);
  const remote = remoteImage(src);

  if (remote === null || failed === remote) {
    return <ProductPlate sku={sku} className={className} />;
  }
  return (
    <img
      className={className}
      src={remote}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(remote)}
    />
  );
}
