import type { VerifiedPage } from "./web-verify.js";

/**
 * The picture a named row may carry: `https:`, and one the page itself put on
 * a product.
 *
 * DECISION: a picture nobody can place is dropped, not refused. Every other
 * string on a card is a claim the shopper can weigh - a title they can read,
 * a price they can compare - but a picture is simply believed, so it is the
 * one field where a URL of the model's own choosing would be shown to
 * somebody as the shop's. The row is still a real listing when the picture
 * cannot be placed, though, and throwing the listing away over its photograph
 * would cost the shopper the product to protect them from the image. So the
 * card goes up under the woven mark instead.
 */
export function pictureFor(
  read: VerifiedPage | null,
  named: string | null | undefined,
): string | null {
  if (read === null || named === undefined || named === null) return null;
  const wanted = named.trim();
  return read.images.includes(wanted) ? wanted : null;
}
