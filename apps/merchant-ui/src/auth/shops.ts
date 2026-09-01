import type { EnrolmentView } from "../api/merchantTypes.ts";
import type { Shop } from "./types.ts";

/**
 * The list of shops this console will open, taken from the trust ring the
 * gateway pinned at boot and from nowhere else. A merchant not in it does not
 * appear here, and a merchant onboarded after that boot will not appear until
 * the gateway restarts — the ring is read once and never fetched.
 *
 * The slug is the tail of the issuer URN. Deriving it beats carrying a second
 * mapping that could disagree with the ring, which is the same reason the
 * gateway derives it that way on its side.
 */
export function shopsOf(enrolled: readonly EnrolmentView[]): Shop[] {
  return enrolled.map((entry) => ({
    slug: entry.issuer.slice(entry.issuer.lastIndexOf(":") + 1),
    issuer: entry.issuer,
    kids: [...entry.kids],
  }));
}

/** Which shop a kid belongs to, for saying so when a key is held. */
export function shopForKid(shops: readonly Shop[], kid: string): Shop | null {
  return shops.find((shop) => shop.kids.includes(kid)) ?? null;
}
