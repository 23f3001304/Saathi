import type { WebListingView } from "../browser/web-listing.js";
import { productKey } from "../browser/listing-identity.js";

/**
 * The one product a buy errand is allowed to be about.
 *
 * DECISION: enforced at the tool, not asked for in the prompt. A live pick of
 * an ADATA XPG failed to open its listing, and the errand then typed into
 * Amazon's search box and opened a *Western Digital* product page — a
 * different manufacturer's drive, inside an errand whose entire subject was
 * the ADATA the shopper had tapped. The prompt said which listing it was
 * about. The prompt is not a mechanism.
 *
 * DECISION: search pages stay open. A URL with no product id in it — the
 * shop's own search, a category, the basket — is how an errand recovers from a
 * failed open, and refusing those would leave a broken pick with nowhere to
 * go. What is refused is the specific act the fault consisted of: opening a
 * *different product*.
 */
export class WebPin {
  private held: string | null = null;

  get product(): string | null {
    return this.held;
  }

  get pinned(): boolean {
    return this.held !== null;
  }

  /** `null` where the shop puts no id in its URLs: nothing to enforce, and a
   *  pin nobody can check is worse than none. */
  hold(listing: WebListingView): void {
    this.held = productKey(listing.url);
  }

  release(): void {
    this.held = null;
  }

  /** Whether the errand may open this. Unpinned, everything; pinned, the
   *  product itself and any page that is not a product. */
  allows(url: string): boolean {
    if (this.held === null) return true;
    const asked = productKey(url);
    return asked === null || asked === this.held;
  }
}
